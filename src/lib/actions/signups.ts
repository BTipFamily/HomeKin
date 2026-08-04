'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendStatement } from '@/lib/statements'
import { type BookingMode } from '@/lib/event-pricing'
import { repriceGroupEvent } from '@/lib/actions/group-pricing'

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

/** The fields every balance decision below depends on. */
type PricedEvent = {
  id: string
  reunion_id: string
  capacity: number | null
  cost_per_person: number
  booking_mode: BookingMode
}

/**
 * Creates the member's balance for an event, or updates what it says is owed.
 *
 * `amount_owed` is always rewritten, including on an already-paid balance.
 * This used to be skipped unless the status was 'unpaid', so adding a guest
 * after paying silently left the old, too-small figure and nobody was ever
 * billed the difference. Status is derived from the payments ledger, so raising
 * the amount reopens the balance and lowering it below what has been paid
 * leaves a credit — both without anything here having to say so.
 *
 * `owed` is optional because a group event's figure is settled afterwards by
 * repriceGroupEvent, once this row exists to be included in the sweep.
 */
async function ensureBalance(
  event: PricedEvent,
  memberId: string,
  subEventId: string,
  owed = 0
): Promise<void> {
  const service = createServiceClient()

  const { data: existing } = await service
    .from('balances')
    .select('id')
    .eq('member_id', memberId)
    .eq('sub_event_id', subEventId)
    .maybeSingle()

  if (!existing) {
    await service.from('balances').insert({
      member_id: memberId,
      reunion_id: event.reunion_id,
      sub_event_id: subEventId,
      amount_owed: owed,
      amount_paid: 0,
    })
  } else if (owed > 0) {
    await service.from('balances').update({ amount_owed: owed }).eq('id', existing.id)
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
  const bookingReference = (formData.get('booking_reference') as string | null)?.trim() || null
  const externalAmountRaw = (formData.get('external_amount') as string | null)?.trim()

  const headcount = parseInt(headcountRaw)
  if (headcount < 1) throw new Error('Headcount must be at least 1')

  const externalAmount =
    externalAmountRaw && externalAmountRaw !== '' ? Number.parseFloat(externalAmountRaw) : null
  if (externalAmount !== null && (!Number.isFinite(externalAmount) || externalAmount < 0)) {
    throw new Error('What you paid the vendor cannot be negative')
  }

  const { data: subEventRow } = await supabase
    .from('sub_events')
    .select('id, capacity, reunion_id, cost_per_person, booking_mode')
    .eq('id', subEventId)
    .single()

  const subEvent = subEventRow as PricedEvent | null
  const reunionId = subEvent?.reunion_id

  if (subEvent?.capacity) {
    // Via the security-definer function, not a direct query. The signups select
    // policy shows a member only their own rows, so asking the anon client for
    // everyone *else's* signups returned nothing and the capacity check passed
    // for every ordinary member — silently, and only for the people it exists
    // to limit.
    const { data: totalHeadcount } = await supabase.rpc('event_headcount', {
      p_sub_event: subEventId,
    })

    const { data: mine } = await supabase
      .from('signups')
      .select('headcount')
      .eq('sub_event_id', subEventId)
      .eq('member_id', member.id)
      .maybeSingle()

    // This upsert replaces the member's own signup rather than adding to it.
    const others = Number(totalHeadcount ?? 0) - Number(mine?.headcount ?? 0)
    if (others + headcount > subEvent.capacity) {
      throw new Error(
        `Not enough capacity. Only ${Math.max(subEvent.capacity - others, 0)} spots remaining.`
      )
    }
  }

  const { error } = await supabase.from('signups').upsert(
    {
      sub_event_id: subEventId,
      member_id: member.id,
      headcount,
      guest_names: guestNames || null,
      booking_reference: bookingReference,
      external_amount: externalAmount,
      status: 'pending',
    },
    { onConflict: 'sub_event_id,member_id' }
  )

  if (error) throw new Error(error.message)

  // A direct event is booked and paid for on the vendor's own site, so HomeKin
  // records who is going and deliberately creates no balance. Billing for money
  // the committee is not collecting would make the budget page overstate what
  // it holds.
  if (subEvent && subEvent.booking_mode !== 'direct' && reunionId) {
    if (subEvent.booking_mode === 'group') {
      // Priced from the whole event, so this member's signup may have just
      // changed what everyone owes.
      await ensureBalance(subEvent, member.id, subEventId)
      await repriceGroupEvent(subEvent.id)
    } else if (subEvent.cost_per_person > 0) {
      await ensureBalance(subEvent, member.id, subEventId, headcount * subEvent.cost_per_person)
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

  // Leaving a group event can drop it back below a threshold, which puts the
  // price up for everyone still going. Unwelcome, but the alternative is
  // billing families less than the vendor is charging the reunion. No mode
  // check here — repriceGroupEvent does nothing on an event that is not one.
  await repriceGroupEvent(subEventId)

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
