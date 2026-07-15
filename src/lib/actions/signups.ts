'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function upsertSignup(formData: FormData) {
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

  const subEventId = formData.get('sub_event_id') as string
  const headcountRaw = formData.get('headcount') as string
  const guestNames = formData.get('guest_names') as string

  const headcount = parseInt(headcountRaw)
  if (headcount < 1) throw new Error('Headcount must be at least 1')

  // Check capacity
  const { data: subEvent } = await supabase
    .from('sub_events')
    .select('capacity, reunion_id, cost_per_person')
    .eq('id', subEventId)
    .single()

  if (subEvent?.capacity) {
    const { data: existingSignups } = await supabase
      .from('signups')
      .select('headcount')
      .eq('sub_event_id', subEventId)
      .neq('member_id', member.id)

    const currentHeadcount = existingSignups?.reduce((sum, s) => sum + s.headcount, 0) ?? 0
    if (currentHeadcount + headcount > subEvent.capacity) {
      throw new Error(
        `Not enough capacity. Only ${subEvent.capacity - currentHeadcount} spots remaining.`
      )
    }
  }

  const { error } = await supabase.from('signups').upsert(
    {
      sub_event_id: subEventId,
      member_id: member.id,
      headcount,
      guest_names: guestNames || null,
      status: 'pending',
    },
    { onConflict: 'sub_event_id,member_id' }
  )

  if (error) throw new Error(error.message)

  const reunionId = subEvent?.reunion_id

  // Auto-sync balance row for paid events (server-side only, bypasses RLS)
  if (subEvent && subEvent.cost_per_person > 0 && reunionId) {
    const serviceClient = createServiceClient()
    // Check for existing unpaid/pending balance to avoid overwriting a paid one
    const { data: existing } = await serviceClient
      .from('balances')
      .select('id, status')
      .eq('member_id', member.id)
      .eq('sub_event_id', subEventId)
      .maybeSingle()

    if (!existing) {
      await serviceClient.from('balances').insert({
        member_id: member.id,
        reunion_id: reunionId,
        sub_event_id: subEventId,
        amount_owed: headcount * subEvent.cost_per_person,
        amount_paid: 0,
        status: 'unpaid',
      })
    } else if (existing.status === 'unpaid') {
      // Update amount if headcount changed and not yet paid
      await serviceClient
        .from('balances')
        .update({ amount_owed: headcount * subEvent.cost_per_person })
        .eq('id', existing.id)
    }
  }

  revalidatePath(`/reunion/${reunionId}/events/${subEventId}`)
  revalidatePath(`/reunion/${reunionId}/signups`)
}

export async function cancelSignup(signupId: string, reunionId: string, subEventId: string) {
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

  const { error } = await supabase
    .from('signups')
    .delete()
    .eq('id', signupId)
    .eq('member_id', member.id)

  if (error) throw new Error(error.message)

  revalidatePath(`/reunion/${reunionId}/events/${subEventId}`)
  revalidatePath(`/reunion/${reunionId}/signups`)
}

export async function confirmSignup(signupId: string, reunionId: string) {
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

  const { error } = await supabase
    .from('signups')
    .update({ status: 'confirmed' })
    .eq('id', signupId)

  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}`)
}
