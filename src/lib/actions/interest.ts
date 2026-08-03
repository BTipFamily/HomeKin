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

export type InterestDraft = Omit<InterestResponse, 'member_id' | 'household_id'>

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

  const { data: household } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('member_id', member.id)
    .maybeSingle()

  const { error } = await supabase.from('interest_responses').upsert(
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
      notes: draft.notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'reunion_id,member_id' }
  )

  if (error) throw new Error(error.message)

  revalidatePath(`/reunion/${reunionId}/interest`)
  revalidatePath(`/reunion/${reunionId}`)
}
