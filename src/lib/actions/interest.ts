'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { InterestResponse } from '@/lib/interest-summary'

async function currentMember(): Promise<{ id: string }> {
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
  return member as { id: string }
}

export type DateRangeDraft = { starts_on: string; ends_on: string }

export type InterestDraft = Omit<InterestResponse, 'member_id' | 'household_id'> & {
  date_ranges: DateRangeDraft[]
  suggested_locations: string[]
  food_preferences: string[]
}

const FOOD_PREFERENCES = ['catered', 'potluck', 'cookout', 'restaurant', 'mixed']

/**
 * Keeps only the windows a family actually filled in, and only ones that make
 * sense. A range whose end precedes its start is a typo, and the database
 * would refuse it anyway — catching it here says so in words instead.
 */
function readDateRanges(ranges: DateRangeDraft[]): DateRangeDraft[] {
  const cleaned: DateRangeDraft[] = []
  for (const range of ranges) {
    if (!range.starts_on || !range.ends_on) continue
    if (range.ends_on < range.starts_on) {
      throw new Error('A date range cannot end before it starts')
    }
    cleaned.push(range)
  }
  return cleaned
}

/**
 * Records or updates this member's interest in a reunion.
 *
 * Upsert on the (reunion_id, member_id) unique index, the same idiom
 * submitSurveyResponse uses: changing your mind edits your answer rather than
 * adding a second opinion the projection would count twice.
 *
 * The household is looked up rather than accepted from the caller, so a
 * response is always attributed to the family the member actually belongs to.
 */
export async function saveInterest(
  reunionId: string,
  draft: InterestDraft
): Promise<void> {
  const member = await currentMember()
  const supabase = await createClient()

  if (draft.adults < 0 || draft.youth < 0 || draft.children < 0) {
    throw new Error('A party size cannot be negative')
  }

  const months = [...new Set(draft.preferred_months)].filter((m) => m >= 1 && m <= 12)
  const ranges = readDateRanges(draft.date_ranges ?? [])
  const food = (draft.food_preferences ?? []).filter((f) => FOOD_PREFERENCES.includes(f))
  const locations = (draft.suggested_locations ?? [])
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  const { data: household } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('member_id', member.id)
    .maybeSingle()

  const { data: saved, error } = await supabase.from('interest_responses').upsert(
    {
      reunion_id: reunionId,
      member_id: member.id,
      household_id: household?.household_id ?? null,
      attending: draft.attending,
      adults: draft.adults,
      youth: draft.youth,
      children: draft.children,
      preferred_months: months,
      preferred_length: draft.preferred_length,
      budget_band: draft.budget_band,
      lodging_need: draft.lodging_need,
      willing_to_volunteer: draft.willing_to_volunteer,
      volunteer_areas: draft.volunteer_areas,
      history_interest: draft.history_interest,
      suggested_locations: locations,
      food_preferences: food,
      notes: draft.notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'reunion_id,member_id' }
  ).select('id').single()

  if (error) throw new Error(error.message)

  // Replaced wholesale rather than reconciled: a window carries no history and
  // nothing references its id, so "these are my dates now" is the whole rule.
  const responseId = (saved as { id: string }).id
  const { error: clearError } = await supabase
    .from('interest_date_ranges')
    .delete()
    .eq('response_id', responseId)
  if (clearError) throw new Error(clearError.message)

  if (ranges.length > 0) {
    const { error: rangeError } = await supabase
      .from('interest_date_ranges')
      .insert(ranges.map((r) => ({ response_id: responseId, ...r })))
    if (rangeError) throw new Error(rangeError.message)
  }

  revalidatePath(`/reunion/${reunionId}/interest`)
  revalidatePath(`/reunion/${reunionId}`)
}
