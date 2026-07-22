'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { computeTotal, type GuestCounts } from '@/lib/budget-estimator'
import type { BudgetCategory, BudgetStyle, LodgingType } from '@/types/database'

export type BudgetEstimateInput = {
  hostCity: string
  nights: number
  budgetStyle: BudgetStyle
  guests: GuestCounts
  lodgingType: LodgingType
  categories: BudgetCategory[]
}

export async function saveBudgetEstimate(reunionId: string, input: BudgetEstimateInput) {
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

  const totals = computeTotal(input.categories, input.guests, input.nights, input.lodgingType)

  const { error } = await supabase.from('reunion_budget_estimates').upsert(
    {
      reunion_id: reunionId,
      host_city: input.hostCity || null,
      nights: input.nights,
      budget_style: input.budgetStyle,
      adults_count: input.guests.adults,
      youth_count: input.guests.youth,
      toddlers_count: input.guests.toddlers,
      lodging_type: input.lodgingType,
      categories: input.categories,
      total_estimate: totals.total,
      created_by: member.id,
    },
    { onConflict: 'reunion_id' }
  )

  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}/budget-estimator`)
  return totals
}
