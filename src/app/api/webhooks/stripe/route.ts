import { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { sendReceipt } from '@/lib/statements'
import { stripePaymentMethodSlug } from '@/lib/stripe-payment-method'
import { createServiceClient } from '@/lib/supabase/server'

// Stripe requires the raw body for signature verification — do not parse JSON first
export const dynamic = 'force-dynamic'

// A handler makes a couple of Stripe calls, an insert and an email. Bounded
// well inside the five minutes after which `claim_webhook_event` assumes an
// attempt has died, so a handler that is merely slow can never have its event
// taken off it by a concurrent retry.
export const maxDuration = 30

/** Postgres unique violation: a guard doing its job, not a failure. */
const UNIQUE_VIOLATION = '23505'

/** The PaymentIntent behind a session or charge, whether expanded or not. */
function intentId(
  intent: string | Stripe.PaymentIntent | null | undefined
): string | null {
  if (!intent) return null
  return typeof intent === 'string' ? intent : intent.id
}

/**
 * Which method Stripe actually charged — 'apple_pay', 'cashapp', 'card', …
 *
 * The webhook's session object carries no payment method details, so this is a
 * second call to Stripe. It is allowed to fail: a null here costs a label on
 * the budget page, whereas letting it throw would fail the whole handler, and
 * a non-2xx makes Stripe redeliver the event. The amount recorded must never
 * depend on this lookup succeeding.
 */
async function lookupPaymentMethod(sessionId: string): Promise<string | null> {
  try {
    const full = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent.payment_method'],
    })
    const intent = full.payment_intent
    if (!intent || typeof intent === 'string') return null
    const method = intent.payment_method
    if (!method || typeof method === 'string') return null
    return stripePaymentMethodSlug(method)
  } catch (e) {
    console.error('Stripe webhook: could not read payment method', sessionId, e)
    return null
  }
}

/**
 * Records a completed checkout as a payment.
 *
 * Nothing here touches balances.amount_paid: a trigger derives it from the
 * ledger. That is what stopped this handler from clobbering a manual payment
 * the member had already made, which it used to do by assigning the session
 * total over the top of whatever was there.
 *
 * Replays are handled by the unique index on stripe_session_id rather than by
 * checking first, so two webhook deliveries racing each other still produce
 * one payment.
 */
async function recordCheckoutPayment(session: Stripe.Checkout.Session): Promise<void> {
  const balanceId = session.metadata?.balance_id
  const memberId = session.metadata?.member_id
  const reunionId = session.metadata?.reunion_id

  if (!balanceId || !memberId || !reunionId) {
    // Nothing actionable. Deliberately not thrown: a redelivery cannot add the
    // metadata, so failing would only make Stripe retry until it gave up.
    console.error('Stripe webhook: session is missing metadata', session.id)
    return
  }

  const amount = (session.amount_total ?? 0) / 100
  if (amount <= 0) {
    console.error('Stripe webhook: session has no amount', session.id)
    return
  }

  // Before the insert, so the method is part of the single write the unique
  // index guards rather than a follow-up update that a replay could repeat.
  const stripePaymentMethod = await lookupPaymentMethod(session.id)

  const service = createServiceClient()
  const { data: inserted, error } = await service
    .from('payments')
    .insert({
      balance_id: balanceId,
      member_id: memberId,
      reunion_id: reunionId,
      amount,
      // Stays 'stripe' whatever the wallet was: 'cashapp' here would collide
      // with a member's unconfirmed manual Cash App report. The specifics live
      // in stripe_payment_method.
      method: 'stripe',
      status: 'confirmed',
      paid_at: new Date().toISOString(),
      stripe_session_id: session.id,
      // Taken off the session rather than the lookup above, so a refund can
      // still find this row on a day when Stripe's API call failed.
      stripe_payment_intent_id: intentId(session.payment_intent),
      stripe_payment_method: stripePaymentMethod,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 is the unique index on stripe_session_id doing its job.
    if (error.code === UNIQUE_VIOLATION) return
    throw new Error(`Failed to record payment for ${session.id}: ${error.message}`)
  }

  // Acknowledge the payment. Deliberately after the insert has succeeded and
  // outside its error handling: a mail failure must not fail the handler, or
  // Stripe retries the webhook and we record the payment again on the next
  // delivery.
  if (inserted) {
    try {
      await sendReceipt(inserted.id as string)
    } catch (e) {
      console.error('Stripe webhook: failed to send receipt', session.id, e)
    }
  }
}

/**
 * The original card payment a refund is reversing.
 *
 * Refund events carry a charge and a PaymentIntent and know nothing about the
 * Checkout Session that started it all, which is what the ledger was keyed on
 * until now. Rows written before `stripe_payment_intent_id` existed therefore
 * need the long way round: ask Stripe which session produced this intent, then
 * look that up.
 */
async function findOriginalPayment(paymentIntentId: string) {
  const service = createServiceClient()

  const byIntent = await service
    .from('payments')
    .select('id, balance_id, member_id, reunion_id')
    // Refund rows carry the same intent id, so this has to say "the payment,
    // not one of its reversals".
    .is('stripe_refund_id', null)
    .eq('stripe_payment_intent_id', paymentIntentId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (byIntent.data?.[0]) return byIntent.data[0]

  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  })
  const sessionId = sessions.data[0]?.id
  if (!sessionId) return null

  const bySession = await service
    .from('payments')
    .select('id, balance_id, member_id, reunion_id')
    .eq('stripe_session_id', sessionId)
    .maybeSingle()

  return bySession.data ?? null
}

/**
 * Mirrors a refund taken at Stripe into the ledger.
 *
 * A refund is an ordinary negative row in `payments` — the schema was written
 * that way from the start — so balances.amount_paid comes back down through the
 * same trigger as every other payment. Nothing special-cases a refund anywhere
 * downstream.
 *
 * The whole refund list is walked rather than just the delta on this event.
 * Two partial refunds produce two `charge.refunded` events, each carrying the
 * cumulative total, so reading `amount_refunded` would either double-count or
 * need arithmetic against what is already recorded. One row per Stripe refund
 * object, deduped on its id, is exact by construction and self-heals if an
 * event was never delivered.
 */
async function recordRefunds(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId = intentId(charge.payment_intent)
  if (!paymentIntentId) {
    console.error('Stripe webhook: refunded charge has no payment intent', charge.id)
    return
  }

  const original = await findOriginalPayment(paymentIntentId)
  if (!original) {
    // Refunded money that the ledger never knew it had. Not retryable — a
    // redelivery will not conjure the payment — so it is logged for the
    // committee and left for the reconciliation job to keep flagging.
    console.error(
      'Stripe webhook: refunded a charge with no matching payment',
      charge.id,
      paymentIntentId
    )
    return
  }

  const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 })
  const service = createServiceClient()

  for (const refund of refunds.data) {
    // A pending or failed refund is not money back in anybody's pocket yet.
    if (refund.status !== 'succeeded') continue

    const { error } = await service.from('payments').insert({
      balance_id: original.balance_id,
      member_id: original.member_id,
      reunion_id: original.reunion_id,
      amount: -(refund.amount / 100),
      method: 'stripe',
      status: 'confirmed',
      paid_at: new Date(refund.created * 1000).toISOString(),
      stripe_refund_id: refund.id,
      stripe_payment_intent_id: paymentIntentId,
      note: 'Refunded at Stripe.',
    })

    // 23505 is the unique index on stripe_refund_id: already recorded.
    if (error && error.code !== UNIQUE_VIOLATION) {
      throw new Error(`Failed to record refund ${refund.id}: ${error.message}`)
    }
  }
}

/**
 * Lets go of a checkout that will never complete.
 *
 * There is deliberately no 'failed' state to move a balance into. A balance
 * whose payment did not happen is unpaid, which is what it already said; adding
 * a failure state would be a second place that has to be cleared before the
 * member can try again. All that is stale is the pointer at the dead session.
 */
async function releaseSession(session: Stripe.Checkout.Session): Promise<void> {
  const balanceId = session.metadata?.balance_id
  if (!balanceId) return

  const service = createServiceClient()
  const { error } = await service
    .from('balances')
    .update({ stripe_checkout_session_id: null })
    // Scoped to this session, so a member who has already started a fresh
    // checkout does not lose the live one when the abandoned one expires.
    .eq('id', balanceId)
    .eq('stripe_checkout_session_id', session.id)

  if (error) {
    throw new Error(`Failed to release session ${session.id}: ${error.message}`)
  }
}

/** Routes one verified event. Throwing here means "Stripe should send it again". */
async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      // Bank debits and other delayed methods complete the session while the
      // money is still in flight. Crediting those here would mark a balance
      // paid before the funds arrive; async_payment_succeeded is the signal
      // that they did.
      if (session.payment_status === 'unpaid') return
      return recordCheckoutPayment(session)
    }

    case 'checkout.session.async_payment_succeeded':
      return recordCheckoutPayment(event.data.object)

    case 'checkout.session.async_payment_failed':
      console.warn('Stripe webhook: delayed payment failed', event.data.object.id)
      return releaseSession(event.data.object)

    case 'checkout.session.expired':
      return releaseSession(event.data.object)

    case 'payment_intent.payment_failed': {
      // Nothing to record: no payment was taken, so the ledger is already
      // right. Logged because a card being declined is the thing a committee
      // asks about when somebody says they tried to pay.
      const intent = event.data.object
      console.warn(
        'Stripe webhook: payment failed',
        intent.id,
        intent.last_payment_error?.message ?? 'no reason given'
      )
      return
    }

    case 'charge.refunded':
      return recordRefunds(event.data.object)

    default:
      return
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return Response.json({ error: 'Missing signature' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set')
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Stripe webhook verification failed:', message)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const service = createServiceClient()

  // Claimed before any work, for every event type rather than only the ones
  // that insert a payment. Losing the claim means this delivery is a replay of
  // something already finished, or a second copy racing the first.
  const { data: claimed, error: claimError } = await service.rpc('claim_webhook_event', {
    p_event_id: event.id,
    p_type: event.type,
  })

  if (claimError) {
    // The guard itself is unavailable. Processing anyway would be processing
    // unguarded, so hand it back and let Stripe retry.
    console.error('Stripe webhook: could not claim event', event.id, claimError.message)
    return Response.json({ error: 'Could not claim event' }, { status: 500 })
  }

  if (!claimed) {
    return Response.json({ received: true, duplicate: true })
  }

  try {
    await handleEvent(event)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('Stripe webhook: handler failed', event.id, event.type, message)
    // Leaves processed_at null, so Stripe's retry can reclaim the event once
    // this attempt has gone stale.
    await service.rpc('complete_webhook_event', { p_event_id: event.id, p_error: message })
    return Response.json({ error: 'Handler failed' }, { status: 500 })
  }

  await service.rpc('complete_webhook_event', { p_event_id: event.id, p_error: null })
  return Response.json({ received: true })
}
