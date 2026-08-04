'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { geocodeAddress } from '@/lib/geocoding'
import {
  parseDeadlinesFromForm,
  validateDeadlines,
  type DeadlineInput,
} from '@/lib/payment-schedule'
import {
  parseTiersFromForm,
  validateTiers,
  type BookingMode,
  type PriceTier,
} from '@/lib/event-pricing'
import { repriceGroupEvent } from '@/lib/actions/group-pricing'
import type { EventFormState } from '@/lib/event-form'

const BOOKING_MODES: BookingMode[] = ['homekin', 'direct', 'group']

/**
 * Reads the booking mode and the vendor details that go with it.
 *
 * An unrecognised mode falls back to 'homekin' rather than erroring: the value
 * comes from a select the committee did not type into, so a surprise here is a
 * bug on our side, and defaulting to "the committee collects" is the safe way
 * to be wrong — it bills, which someone will notice, rather than silently not
 * billing, which nobody will.
 */
function readBookingFields(formData: FormData) {
  const raw = (formData.get('booking_mode') as string | null) ?? 'homekin'
  const bookingMode: BookingMode = BOOKING_MODES.includes(raw as BookingMode)
    ? (raw as BookingMode)
    : 'homekin'

  const minGroupRaw = (formData.get('min_group_size') as string | null)?.trim()
  const minGroupSize = minGroupRaw ? Number.parseInt(minGroupRaw, 10) : null
  if (minGroupSize !== null && (!Number.isFinite(minGroupSize) || minGroupSize < 1)) {
    throw new Error('A minimum group size must be at least 1 person.')
  }

  return {
    booking_mode: bookingMode,
    vendor_name: ((formData.get('vendor_name') as string | null) ?? '').trim() || null,
    vendor_url: ((formData.get('vendor_url') as string | null) ?? '').trim() || null,
    booking_deadline: ((formData.get('booking_deadline') as string | null) ?? '') || null,
    min_group_size: minGroupSize,
  }
}

/**
 * Reads the group price tiers, refusing the save if they do not hang together.
 *
 * Checked before the event is written, for the same reason the deadlines are:
 * a bad tier ladder should not leave a half-created event behind. Tiers are
 * only meaningful on a group event, so anything typed into a form that was
 * later switched to another mode is discarded rather than saved and ignored.
 */
function readTiers(formData: FormData, bookingMode: BookingMode, basePrice: number): PriceTier[] {
  if (bookingMode !== 'group') return []
  const tiers = parseTiersFromForm(formData)
  const errors = validateTiers(tiers, basePrice)
  if (errors.length > 0) throw new Error(errors.join(' '))
  return tiers
}

function failed(e: unknown): EventFormState {
  return {
    status: 'error',
    message: e instanceof Error ? e.message : 'The event could not be saved.',
  }
}

/**
 * Reads the deadline rows off the form and refuses the save if they do not hang
 * together.
 *
 * Validated before the event itself is written, so a bad schedule does not
 * leave a half-created event behind. The database enforces most of the same
 * rules, but a constraint violation reaches the committee as a Postgres error
 * code — these messages say what to change.
 */
function readDeadlines(formData: FormData, eventDate: string | null): DeadlineInput[] {
  const deadlines = parseDeadlinesFromForm(formData)
  const errors = validateDeadlines(deadlines, eventDate)
  if (errors.length > 0) throw new Error(errors.join(' '))
  return deadlines
}

/**
 * Turns a Postgres error into something the committee can act on.
 *
 * 42P01 is "relation does not exist", which here means one thing: migration
 * 017 has not been applied to this Supabase project. Left raw it surfaces as
 * Next's generic "a server error occurred", which says nothing and sends
 * somebody hunting through logs for a one-line fix.
 */
function explainDeadlineError(error: { code?: string; message: string }): string {
  if (error.code === '42P01') {
    return (
      'Payment deadlines need a database update that has not been applied yet. ' +
      'Ask whoever manages the Supabase project to run migration ' +
      '017_event_deadlines.sql, then try again.'
    )
  }
  return error.message
}

function deadlineRow(deadline: DeadlineInput, eventId: string, index: number) {
  return {
    sub_event_id: eventId,
    label: deadline.label.trim(),
    due_date: deadline.due_date,
    amount_type: deadline.amount_type,
    amount_value: deadline.amount_value,
    reminder_offsets: deadline.reminder_offsets,
    sort_order: index,
  }
}

export async function deleteSubEvent(eventId: string, reunionId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await supabase
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member || !['committee', 'admin'].includes(member.role)) {
    throw new Error('Committee or admin access required')
  }

  const serviceClient = createServiceClient()
  const { error } = await serviceClient.from('sub_events').delete().eq('id', eventId)
  if (error) throw new Error(error.message)

  revalidatePath(`/reunion/${reunionId}/events`)
  redirect(`/reunion/${reunionId}/events`)
}

export async function createSubEvent(
  reunionId: string,
  _prevState: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  let createdId: string

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: member } = await supabase
      .from('members')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .single()
    if (!member || !['committee', 'admin'].includes(member.role)) {
      throw new Error('Committee or admin access required')
    }

    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const date = formData.get('date') as string
    const time = formData.get('time') as string
    const locationName = formData.get('location_name') as string
    const address = formData.get('address') as string
    const costRaw = formData.get('cost_per_person') as string
    const capacityRaw = formData.get('capacity') as string
    const durationRaw = formData.get('duration_minutes') as string

    const cost = parseFloat(costRaw) || 0
    const capacity = capacityRaw ? parseInt(capacityRaw) : null
    const durationMinutes = durationRaw ? parseInt(durationRaw) : null

    if (cost < 0) throw new Error('Cost cannot be negative')
    if (capacity !== null && capacity < 1) throw new Error('Capacity must be at least 1')

    const deadlines = readDeadlines(formData, date || null)
    const booking = readBookingFields(formData)
    const tiers = readTiers(formData, booking.booking_mode, cost)

    const normalizedAddress = address || null
    const geoFields: Record<string, unknown> = {}
    if (normalizedAddress) {
      const result = await geocodeAddress(normalizedAddress)
      geoFields.latitude = result?.lat ?? null
      geoFields.longitude = result?.lng ?? null
      geoFields.geocoded_address = result ? normalizedAddress : null
      geoFields.geocode_updated_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('sub_events')
      .insert({
        reunion_id: reunionId,
        name,
        description: description || null,
        date,
        time: time || null,
        location_name: locationName || null,
        address: normalizedAddress,
        cost_per_person: cost,
        capacity,
        duration_minutes: durationMinutes,
        created_by: member.id,
        ...booking,
        ...geoFields,
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)

    if (tiers.length > 0) {
      const { error: tierError } = await supabase
        .from('event_price_tiers')
        .insert(tiers.map((t) => ({ sub_event_id: data.id, ...t })))
      if (tierError) {
        throw new Error(
          `The event was created, but its group prices were not saved. ${explainDeadlineError(tierError)}`
        )
      }
    }

    if (deadlines.length > 0) {
      const { error: deadlineError } = await supabase
        .from('event_deadlines')
        .insert(deadlines.map((d, i) => deadlineRow(d, data.id, i)))

      // The event exists at this point, so the committee is told what went wrong
      // rather than being bounced back to a form that would create a second one.
      if (deadlineError) {
        throw new Error(
          `The event was created, but its payment deadlines were not saved. ${explainDeadlineError(deadlineError)}`
        )
      }
    }
    createdId = data.id as string
  } catch (e) {
    return failed(e)
  }

  revalidatePath(`/reunion/${reunionId}/events`)
  revalidatePath(`/reunion/${reunionId}/map`)
  // Outside the try: redirect signals itself by throwing, so catching it here
  // would turn every successful save into an error message.
  redirect(`/reunion/${reunionId}/events/${createdId}`)
}

export async function updateSubEvent(
  eventId: string,
  reunionId: string,
  _prevState: EventFormState,
  formData: FormData
): Promise<EventFormState> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const date = formData.get('date') as string
    const time = formData.get('time') as string
    const locationName = formData.get('location_name') as string
    const address = formData.get('address') as string
    const costRaw = formData.get('cost_per_person') as string
    const capacityRaw = formData.get('capacity') as string
    const durationRaw = formData.get('duration_minutes') as string

    const cost = parseFloat(costRaw) || 0
    const capacity = capacityRaw ? parseInt(capacityRaw) : null
    const durationMinutes = durationRaw ? parseInt(durationRaw) : null

    const deadlines = readDeadlines(formData, date || null)
    const booking = readBookingFields(formData)
    const tiers = readTiers(formData, booking.booking_mode, cost)

    const normalizedAddress = address || null

    const { data: existing } = await supabase
      .from('sub_events')
      .select('geocoded_address')
      .eq('id', eventId)
      .single()

    const geoFields: Record<string, unknown> = {}
    if (normalizedAddress !== existing?.geocoded_address) {
      if (normalizedAddress) {
        const result = await geocodeAddress(normalizedAddress)
        geoFields.latitude = result?.lat ?? null
        geoFields.longitude = result?.lng ?? null
        geoFields.geocoded_address = result ? normalizedAddress : null
        geoFields.geocode_updated_at = new Date().toISOString()
      } else {
        geoFields.latitude = null
        geoFields.longitude = null
        geoFields.geocoded_address = null
        geoFields.geocode_updated_at = null
      }
    }

    const { error } = await supabase
      .from('sub_events')
      .update({
        name,
        description: description || null,
        date,
        time: time || null,
        location_name: locationName || null,
        address: normalizedAddress,
        cost_per_person: cost,
        capacity,
        duration_minutes: durationMinutes,
        ...booking,
        ...geoFields,
      })
      .eq('id', eventId)

    if (error) throw new Error(error.message)
    await syncDeadlines(eventId, deadlines)
    await syncTiers(eventId, tiers)
  } catch (e) {
    return failed(e)
  }

  revalidatePath(`/reunion/${reunionId}/events/${eventId}`)
  revalidatePath(`/reunion/${reunionId}/events`)
  revalidatePath(`/reunion/${reunionId}/map`)
  redirect(`/reunion/${reunionId}/events/${eventId}`)
}

/**
 * Brings an event's checkpoints in line with what was submitted.
 *
 * Rows are matched by id and updated in place; only the ones the committee
 * actually removed are deleted. Deleting the lot and re-inserting would be
 * shorter and wrong: email_sends.deadline_id cascades, so it would erase the
 * record of which reminders had already gone out and every one of them would
 * send again on the next cron run.
 */
/**
 * Replaces an event's group price tiers wholesale.
 *
 * Delete-then-insert rather than the careful reconcile syncDeadlines does,
 * because a tier carries no history worth preserving — no reminders are logged
 * against it and nothing references its id. A deadline keeps its id precisely
 * so a date change does not re-send reminders; a tier has no such obligation.
 *
 * Reprices afterwards: editing the ladder changes what families owe just as
 * surely as somebody signing up does, and leaving the old figures standing
 * would mean the committee's change quietly applied only to the next person.
 */
async function syncTiers(eventId: string, tiers: PriceTier[]) {
  const service = createServiceClient()

  const { error: clearError } = await service
    .from('event_price_tiers')
    .delete()
    .eq('sub_event_id', eventId)
  if (clearError) throw new Error(explainDeadlineError(clearError))

  if (tiers.length > 0) {
    const { error } = await service
      .from('event_price_tiers')
      .insert(tiers.map((t) => ({ sub_event_id: eventId, ...t })))
    if (error) throw new Error(explainDeadlineError(error))
  }

  await repriceGroupEvent(eventId)
}

async function syncDeadlines(eventId: string, deadlines: DeadlineInput[]) {
  const service = createServiceClient()

  const { data: current, error: readError } = await service
    .from('event_deadlines')
    .select('id')
    .eq('sub_event_id', eventId)

  // Checked rather than ignored: a missing table read as "no existing rows"
  // would make the reconcile below look like a clean insert and fail later with
  // something far less obvious.
  if (readError) throw new Error(explainDeadlineError(readError))

  const submittedIds = new Set(deadlines.map((d) => d.id).filter(Boolean) as string[])
  const removed = ((current ?? []) as { id: string }[])
    .map((row) => row.id)
    .filter((id) => !submittedIds.has(id))

  if (removed.length > 0) {
    const { error } = await service.from('event_deadlines').delete().in('id', removed)
    if (error) throw new Error(explainDeadlineError(error))
  }

  for (const [index, deadline] of deadlines.entries()) {
    const row = deadlineRow(deadline, eventId, index)

    // Updating a row keeps its id, and with it the reminders already logged
    // against it. Moving a deadline's date deliberately does not reset that:
    // somebody who was emailed "due March 1" is not emailed again because the
    // committee shifted it to March 8. A new checkpoint is the way to ask for a
    // fresh round of reminders.
    const { error } = deadline.id
      ? await service.from('event_deadlines').update(row).eq('id', deadline.id)
      : await service.from('event_deadlines').insert(row)

    if (error) throw new Error(explainDeadlineError(error))
  }
}
