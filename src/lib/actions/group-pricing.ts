'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { amountOwedFor, type BookingMode, type PriceTier } from '@/lib/event-pricing'

/**
 * Reprices every balance on a group event from the current total headcount.
 *
 * A group rate is a fact about the whole event rather than about one family, so
 * when a threshold is crossed everybody's balance moves — including families
 * who already paid the old, higher rate. Those land on
 * `amount_paid > amount_owed`, which the app already renders as a credit for
 * the committee to refund. That is the agreed behaviour: nobody is penalised
 * for being the first to commit.
 *
 * Called from three places, all of which can change the answer: a signup, a
 * cancellation, and the committee editing the tier ladder itself.
 *
 * Only `amount_owed` is written. `amount_paid` and `status` are derived by
 * trigger (migration 015), and the payment schedule is computed on read from
 * `amount_owed` (migration 017) — so a tier change reprices every future
 * instalment and every deadline reminder without anything here doing so.
 *
 * The service client throughout: the signups select policy hides other members'
 * rows, so the anon client would total just the caller and price the event as
 * though nobody else had signed up.
 */
export async function repriceGroupEvent(subEventId: string): Promise<void> {
  const service = createServiceClient()

  const { data: eventRow } = await service
    .from('sub_events')
    .select('id, cost_per_person, booking_mode')
    .eq('id', subEventId)
    .maybeSingle()

  const event = eventRow as
    | { id: string; cost_per_person: number; booking_mode: BookingMode }
    | null

  if (!event || event.booking_mode !== 'group') return

  const [{ data: tierRows }, { data: signupRows }, { data: balanceRows }] = await Promise.all([
    service
      .from('event_price_tiers')
      .select('min_headcount, price_per_person')
      .eq('sub_event_id', subEventId),
    service.from('signups').select('member_id, headcount').eq('sub_event_id', subEventId),
    service.from('balances').select('id, member_id').eq('sub_event_id', subEventId),
  ])

  const tiers = (tierRows ?? []) as PriceTier[]
  const signups = (signupRows ?? []) as { member_id: string; headcount: number }[]
  const balances = (balanceRows ?? []) as { id: string; member_id: string }[]

  const total = signups.reduce((sum, s) => sum + Number(s.headcount), 0)
  const headcountByMember = new Map<string, number>(
    signups.map((s) => [s.member_id, Number(s.headcount)])
  )

  for (const balance of balances) {
    const headcount = headcountByMember.get(balance.member_id) ?? 0
    // A balance whose signup is gone belongs to cancelSignup, which decides
    // between deleting it and leaving a credit. Overwriting it with a zero here
    // would undo that decision.
    if (headcount === 0) continue

    await service
      .from('balances')
      .update({
        amount_owed: amountOwedFor(tiers, total, Number(event.cost_per_person), headcount),
      })
      .eq('id', balance.id)
  }
}
