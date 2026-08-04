'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { geocodeAddress } from '@/lib/geocoding'

export type ReunionWizardBasics = {
  name: string
  description: string
  /**
   * Its own field now, not derived from a start date. The reunion is created
   * before anyone has been asked when they can travel, so `new Date(startDate)`
   * would have produced NaN against a NOT NULL column.
   */
  year: number
  hostCity: string
}

export type ReunionWizardDraft = {
  basics: ReunionWizardBasics
}

export async function createReunionWithPlan(draft: ReunionWizardDraft) {
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

  const { basics } = draft
  const year = basics.year
  if (!Number.isFinite(year)) throw new Error('Pick a year for the reunion')

  const geo = basics.hostCity ? await geocodeAddress(basics.hostCity) : null

  const { data: reunion, error: reunionError } = await supabase
    .from('reunions')
    .insert({
      name: basics.name,
      year,
      description: basics.description || null,
      // No dates yet, by design. They are settled on the planning dashboard
      // once the family has said when they can travel.
      start_date: null,
      end_date: null,
      status: 'interest',
      location_name: basics.hostCity || null,
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
      created_by: member.id,
    })
    .select('id')
    .single()

  if (reunionError) throw new Error(reunionError.message)
  const reunionId = reunion.id as string

  // The budget estimate and the generated timeline used to be written here.
  // Both count from a start date, which a reunion no longer has when it is
  // created — generateTimeline works backwards from the event. They now live
  // on the reunion's own Budget Estimator and Timeline pages, usable once the
  // planning dashboard has settled a date.

  revalidatePath('/dashboard')
  return reunionId
}
