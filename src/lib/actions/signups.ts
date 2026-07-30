'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendStatement } from '@/lib/statements'

/**
 * Emails the member their statement without letting a mail failure undo the
 * change that triggered it.
 *
 * The signup is the thing the member asked for; the summary is a courtesy. A
 * refused SMTP login should not lose somebody's place at an event, so the
 * failure is logged (sendEmail already does that) and the action returns
 * normally. The trade-off is that a member is never told the email did not
 * arrive — the page redirects too quickly to say so. The committee report is
 * where a missing statement becomes visible.
 */
async function emailStatement(memberId: string, reunionId: string | undefined) {
  if (!reunionId) return
  try {
    await sendStatement(memberId, reunionId)
  } catch (e) {
    console.error('[Signups] Failed to send statement:', e instanceof Error ? e.message : e)
  }
}

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
    const owed = headcount * subEvent.cost_per_person

    const { data: existing } = await serviceClient
      .from('balances')
      .select('id')
      .eq('member_id', member.id)
      .eq('sub_event_id', subEventId)
      .maybeSingle()

    if (!existing) {
      await serviceClient.from('balances').insert({
        member_id: member.id,
        reunion_id: reunionId,
        sub_event_id: subEventId,
        amount_owed: owed,
        amount_paid: 0,
      })
    } else {
      // Always recalculated, including on an already-paid balance. This used to
      // be skipped unless the status was 'unpaid', so adding a guest after
      // paying silently left the old, too-small figure and nobody was ever
      // billed the difference. Status is derived from the payments ledger, so
      // raising the amount reopens the balance and lowering it below what has
      // been paid leaves a credit — both without anything here saying so.
      await serviceClient
        .from('balances')
        .update({ amount_owed: owed })
        .eq('id', existing.id)
    }
  }

  revalidatePath(`/reunion/${reunionId}/events/${subEventId}`)
  revalidatePath(`/reunion/${reunionId}/signups`)
  revalidatePath(`/reunion/${reunionId}/budget`)
  revalidatePath(`/directory/${member.id}`)

  await emailStatement(member.id, reunionId)
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

  // Cancelling used to leave the balance standing, so someone who pulled out
  // still appeared to owe for an event they were no longer attending.
  const serviceClient = createServiceClient()
  const { data: balance } = await serviceClient
    .from('balances')
    .select('id, amount_paid')
    .eq('member_id', member.id)
    .eq('sub_event_id', subEventId)
    .maybeSingle()

  if (balance) {
    if (Number(balance.amount_paid) === 0) {
      // Nothing was ever paid, so there is nothing to keep a record of.
      await serviceClient.from('balances').delete().eq('id', balance.id)
    } else {
      // Money changed hands. Zeroing what is owed leaves the payments in place
      // and shows as a credit, which is the committee's cue to refund it —
      // rather than quietly deleting a record of real money.
      await serviceClient.from('balances').update({ amount_owed: 0 }).eq('id', balance.id)
    }
  }

  revalidatePath(`/reunion/${reunionId}/events/${subEventId}`)
  revalidatePath(`/reunion/${reunionId}/signups`)
  revalidatePath(`/reunion/${reunionId}/budget`)
  revalidatePath(`/directory/${member.id}`)

  // Sent after cancelling too: what someone most wants to see when they pull
  // out of an event is confirmation that they are no longer being charged for
  // it. `buildStatement` returns null once they have nothing left in the
  // reunion, so a member with no remaining selections is not emailed an empty
  // table.
  await emailStatement(member.id, reunionId)
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
