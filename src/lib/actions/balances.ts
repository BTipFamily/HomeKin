'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function reportManualPayment(
  balanceId: string,
  method: 'zelle' | 'cashapp' | 'check' | 'other',
  reunionId: string
) {
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

  const serviceClient = createServiceClient()
  const { data: balance } = await serviceClient
    .from('balances')
    .select('id, member_id, status')
    .eq('id', balanceId)
    .single()

  if (!balance || balance.member_id !== member.id) throw new Error('Balance not found')
  if (balance.status === 'paid') throw new Error('Already paid')

  const { error } = await serviceClient
    .from('balances')
    .update({ payment_method: method, status: 'pending_confirmation' })
    .eq('id', balanceId)

  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}/signups`)
}

export async function confirmManualPayment(balanceId: string, reunionId: string) {
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
    throw new Error('Committee access required')
  }

  const serviceClient = createServiceClient()
  const { data: balance } = await serviceClient
    .from('balances')
    .select('amount_owed')
    .eq('id', balanceId)
    .single()

  if (!balance) throw new Error('Balance not found')

  const { error } = await serviceClient
    .from('balances')
    .update({ status: 'paid', amount_paid: balance.amount_owed })
    .eq('id', balanceId)

  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}/budget`)
  revalidatePath(`/reunion/${reunionId}/signups`)
}
