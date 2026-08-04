'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { geocodeAddress } from '@/lib/geocoding'

async function requireCommittee(): Promise<{ id: string; role: string }> {
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
    throw new Error('Committee access required')
  }
  return member as { id: string; role: string }
}

/** Promotes a suggestion the family made into a candidate they can vote on. */
export async function shortlistLocation(
  reunionId: string,
  location: {
    name: string
    city?: string | null
    venue_type?: string | null
    capacity?: number | null
    est_cost_per_person?: number | null
    accessibility_notes?: string | null
    notes?: string | null
  }
): Promise<void> {
  const member = await requireCommittee()
  const supabase = await createClient()

  const name = location.name.trim()
  if (!name) throw new Error('A shortlisted place needs a name')

  const { error } = await supabase.from('reunion_locations').insert({
    reunion_id: reunionId,
    name,
    city: location.city?.trim() || null,
    venue_type: location.venue_type?.trim() || null,
    capacity: location.capacity ?? null,
    est_cost_per_person: location.est_cost_per_person ?? null,
    accessibility_notes: location.accessibility_notes?.trim() || null,
    notes: location.notes?.trim() || null,
    created_by: member.id,
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}/planning`)
  revalidatePath(`/reunion/${reunionId}/interest`)
}

export async function removeShortlistedLocation(
  locationId: string,
  reunionId: string
): Promise<void> {
  await requireCommittee()
  const supabase = await createClient()

  const { error } = await supabase.from('reunion_locations').delete().eq('id', locationId)
  if (error) throw new Error(error.message)

  revalidatePath(`/reunion/${reunionId}/planning`)
  revalidatePath(`/reunion/${reunionId}/interest`)
}

/**
 * Casts or withdraws this member's vote for a place.
 *
 * Delete-then-insert leaning on the composite primary key, the same shape as
 * toggleLike: two tabs racing each other end at a consistent count rather than
 * one that drifts, and a duplicate insert means the vote is already there.
 */
export async function toggleLocationVote(
  locationId: string,
  reunionId: string
): Promise<{ voted: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) throw new Error('Member not found')

  const { data: removed, error: deleteError } = await supabase
    .from('location_votes')
    .delete()
    .eq('location_id', locationId)
    .eq('member_id', member.id)
    .select('location_id')

  if (deleteError) throw new Error(deleteError.message)

  if (removed && removed.length > 0) {
    revalidatePath(`/reunion/${reunionId}/interest`)
    revalidatePath(`/reunion/${reunionId}/planning`)
    return { voted: false }
  }

  const { error: insertError } = await supabase
    .from('location_votes')
    .insert({ location_id: locationId, member_id: member.id })

  // 23505 is the primary key doing its job — the vote is already cast.
  if (insertError && insertError.code !== '23505') throw new Error(insertError.message)

  revalidatePath(`/reunion/${reunionId}/interest`)
  revalidatePath(`/reunion/${reunionId}/planning`)
  return { voted: true }
}

/**
 * Settles the date and the place, and moves the reunion on.
 *
 * This is the step everything downstream waits for. The budget estimator and
 * the timeline generator both count from a start date, and events cannot be
 * priced before anyone knows where it is — so nothing after Interest is
 * meaningful until this has been done once.
 *
 * The phase advances to 'planning' only from an earlier one. A committee
 * correcting the date of a reunion that is already open for registration is
 * fixing a detail, not restarting the process, and quietly winding the phase
 * backwards would hide the signup page from every member.
 */
export async function decideDateAndPlace(
  reunionId: string,
  decision: { startDate: string; endDate: string | null; locationId: string | null }
): Promise<void> {
  await requireCommittee()
  const supabase = await createClient()

  if (!decision.startDate) throw new Error('Pick a start date')
  if (decision.endDate && decision.endDate < decision.startDate) {
    throw new Error('The end date is before the start date')
  }

  const { data: reunion } = await supabase
    .from('reunions')
    .select('status')
    .eq('id', reunionId)
    .single()

  let locationFields: Record<string, unknown> = {}
  if (decision.locationId) {
    const { data: location } = await supabase
      .from('reunion_locations')
      .select('name, city')
      .eq('id', decision.locationId)
      .maybeSingle()

    if (location) {
      const place = (location.city || location.name) as string
      const geo = await geocodeAddress(place)
      locationFields = {
        location_name: location.name,
        address: location.city ?? null,
        latitude: geo?.lat ?? null,
        longitude: geo?.lng ?? null,
      }
    }
  }

  const earlyPhases = ['draft', 'interest']
  const advance = earlyPhases.includes((reunion?.status as string) ?? '')

  const { error } = await supabase
    .from('reunions')
    .update({
      start_date: decision.startDate,
      end_date: decision.endDate,
      year: Number.parseInt(decision.startDate.slice(0, 4), 10),
      ...(advance ? { status: 'planning' } : {}),
      ...locationFields,
    })
    .eq('id', reunionId)

  if (error) throw new Error(error.message)

  revalidatePath(`/reunion/${reunionId}`)
  revalidatePath(`/reunion/${reunionId}/planning`)
  revalidatePath('/dashboard')
}
