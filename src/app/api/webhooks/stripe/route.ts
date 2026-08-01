import { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { sendReceipt } from '@/lib/statements'
import { stripePaymentMethodSlug } from '@/lib/stripe-payment-method'
import { createServiceClient } from '@/lib/supabase/server'

// Stripe requires the raw body for signature verification — do not parse JSON first
export const dynamic = 'force-dynamic'

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
async function recordCheckoutPayment(session: Stripe.Checkout.Session): Promise<Response> {
  const balanceId = session.metadata?.balance_id
  const memberId = session.metadata?.member_id
  const reunionId = session.metadata?.reunion_id

  if (!balanceId || !memberId || !reunionId) {
    console.error('Stripe webhook: session is missing metadata', session.id)
    // Nothing actionable, but returning 200 stops Stripe retrying forever.
    return Response.json({ received: true })
  }

  const amount = (session.amount_total ?? 0) / 100
  if (amount <= 0) {
    console.error('Stripe webhook: session has no amount', session.id)
    return Response.json({ received: true })
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
      stripe_payment_method: stripePaymentMethod,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 is the unique index on stripe_session_id doing its job.
    if (error.code === '23505') return Response.json({ received: true, duplicate: true })
    console.error('Stripe webhook: failed to record payment', session.id, error)
    return Response.json({ error: 'DB insert failed' }, { status: 500 })
  }

  // Acknowledge the payment. Deliberately after the insert has succeeded and
  // outside its error handling: a mail failure must not return a 500, or Stripe
  // retries the webhook and we record the payment again on the next delivery.
  if (inserted) {
    try {
      await sendReceipt(inserted.id as string)
    } catch (e) {
      console.error('Stripe webhook: failed to send receipt', session.id, e)
    }
  }

  return Response.json({ received: true })
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

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      // Bank debits and other delayed methods complete the session while the
      // money is still in flight. Crediting those here would mark a balance
      // paid before the funds arrive; async_payment_succeeded is the signal
      // that they did.
      if (session.payment_status === 'unpaid') return Response.json({ received: true })
      return recordCheckoutPayment(session)
    }

    case 'checkout.session.async_payment_succeeded':
      return recordCheckoutPayment(event.data.object)

    case 'checkout.session.async_payment_failed':
      console.warn('Stripe webhook: delayed payment failed', event.data.object.id)
      return Response.json({ received: true })

    default:
      return Response.json({ received: true })
  }
}
