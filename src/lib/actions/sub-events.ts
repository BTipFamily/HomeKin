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

export async function createSubEvent(reunionId: string, formData: FormData) {
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
      ...geoFields,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  if (deadlines.length > 0) {
    const { error: deadlineError } = await supabase
      .from('event_deadlines')
      .insert(deadlines.map((d, i) => deadlineRow(d, data.id, i)))

    // The event exists at this point, so the committee is told what went wrong
    // rather than being bounced back to a form that would create a second one.
    if (deadlineError) {
      throw new Error(
        `The event was created, but its payment deadlines were not saved: ${deadlineError.message}`
      )
    }
  }

  revalidatePath(`/reunion/${reunionId}/events`)
  revalidatePath(`/reunion/${reunionId}/map`)
  redirect(`/reunion/${reunionId}/events/${data.id}`)
}

export async function updateSubEvent(eventId: string, reunionId: string, formData: FormData) {
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
      ...geoFields,
    })
    .eq('id', eventId)

  if (error) throw new Error(error.message)

  await syncDeadlines(eventId, deadlines)

  revalidatePath(`/reunion/${reunionId}/events/${eventId}`)
  revalidatePath(`/reunion/${reunionId}/events`)
  revalidatePath(`/reunion/${reunionId}/map`)
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
async function syncDeadlines(eventId: string, deadlines: DeadlineInput[]) {
  const service = createServiceClient()

  const { data: current } = await service
    .from('event_deadlines')
    .select('id')
    .eq('sub_event_id', eventId)

  const submittedIds = new Set(deadlines.map((d) => d.id).filter(Boolean) as string[])
  const removed = ((current ?? []) as { id: string }[])
    .map((row) => row.id)
    .filter((id) => !submittedIds.has(id))

  if (removed.length > 0) {
    const { error } = await service.from('event_deadlines').delete().in('id', removed)
    if (error) throw new Error(error.message)
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

    if (error) throw new Error(error.message)
  }
}
