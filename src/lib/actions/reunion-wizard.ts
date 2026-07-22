'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { geocodeAddress } from '@/lib/geocoding'
import { computeTotal, type GuestCounts } from '@/lib/budget-estimator'
import { generateTimeline, type TimelineOptions } from '@/lib/timeline-generator'
import type { BudgetCategory, BudgetStyle, LodgingType } from '@/types/database'

export type ReunionWizardBasics = {
  name: string
  description: string
  startDate: string
  endDate: string | null
  hostCity: string
}

export type ReunionWizardBudget = {
  nights: number
  budgetStyle: BudgetStyle
  guests: GuestCounts
  lodgingType: LodgingType
  categories: BudgetCategory[]
}

export type ReunionWizardDraft = {
  basics: ReunionWizardBasics
  budget: ReunionWizardBudget
  timeline: TimelineOptions
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

  const { basics, budget, timeline } = draft
  const year = new Date(basics.startDate).getFullYear()

  const geo = basics.hostCity ? await geocodeAddress(basics.hostCity) : null

  const { data: reunion, error: reunionError } = await supabase
    .from('reunions')
    .insert({
      name: basics.name,
      year,
      description: basics.description || null,
      start_date: basics.startDate,
      end_date: basics.endDate || null,
      location_name: basics.hostCity || null,
      latitude: geo?.lat ?? null,
      longitude: geo?.lng ?? null,
      created_by: member.id,
    })
    .select('id')
    .single()

  if (reunionError) throw new Error(reunionError.message)
  const reunionId = reunion.id as string

  // Budget estimate and timeline items are best-effort: the reunion itself
  // is the important part, and both can be (re)generated later from the
  // reunion's own Budget Estimator / Timeline pages if these inserts fail.
  try {
    const totals = computeTotal(budget.categories, budget.guests, budget.nights, budget.lodgingType)
    const { error } = await supabase.from('reunion_budget_estimates').insert({
      reunion_id: reunionId,
      host_city: basics.hostCity || null,
      nights: budget.nights,
      budget_style: budget.budgetStyle,
      adults_count: budget.guests.adults,
      youth_count: budget.guests.youth,
      toddlers_count: budget.guests.toddlers,
      lodging_type: budget.lodgingType,
      categories: budget.categories,
      total_estimate: totals.total,
      created_by: member.id,
    })
    if (error) console.error('Failed to save budget estimate:', error.message)
  } catch (err) {
    console.error('Failed to save budget estimate:', err)
  }

  try {
    const items = generateTimeline(basics.startDate, timeline)
    const { error } = await supabase.from('reunion_timeline_items').insert(
      items.map((item) => ({
        reunion_id: reunionId,
        title: item.title,
        phase_label: item.phase_label,
        category: item.category,
        due_date: item.due_date,
        sort_order: item.sort_order,
        created_by: member.id,
      }))
    )
    if (error) console.error('Failed to save timeline items:', error.message)
  } catch (err) {
    console.error('Failed to save timeline items:', err)
  }

  revalidatePath('/dashboard')
  return reunionId
}
