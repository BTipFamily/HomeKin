import { NextRequest } from 'next/server'
import { stripe } from '@/lib/stripe'
import {
  reconcile,
  type LedgerEntry,
  type StripeCharge,
} from '@/lib/reconciliation'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Two Stripe list calls plus a Supabase read. Comfortably under this on a
// family-sized account, but the default 10s would be tight on the first run
// after a busy weekend.
export const maxDuration = 60

/** How far back to check. Long enough to catch a webhook outage nobody noticed. */
const WINDOW_DAYS = 30

/**
 * Extra days of Stripe history to pull in.
 *
 * The two sides are keyed on different clocks — `paid_at` in the ledger, the
 * charge's own creation time at Stripe — and a delayed bank debit puts days
 * between them. Without the overlap a payment that straddles the cutoff would
 * be reported as missing from Stripe every night until it aged out.
 */
const OVERLAP_DAYS = 3

/** Enough for any family reunion; a bound rather than an expectation. */
const MAX_CHARGES = 1000

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/**
 * Checks that the ledger and Stripe still tell the same story.
 *
 * Driven by Vercel Cron (see vercel.json), behind the same `CRON_SECRET` as the
 * reminder job — this one reads every card payment the family has taken, which
 * is not a URL to leave open.
 *
 * The webhook is the only writer of a card payment, so nothing else would ever
 * notice an event Stripe failed to deliver, a handler that threw, or a refund
 * issued from the Stripe dashboard. This is the check that does. It reports and
 * never repairs: a second thing writing money is the bug the payments ledger
 * exists to prevent, and a job that quietly invents a payment to make the
 * numbers agree is worse than one that says they do not.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[Reconcile] CRON_SECRET is not set; refusing to run')
    return Response.json({ error: 'Not configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = daysAgo(WINDOW_DAYS)
  const service = createServiceClient()

  const { data: rows, error } = await service
    .from('payments')
    .select('id, amount, stripe_payment_intent_id')
    // Manual payments have no counterpart at Stripe to compare against, and a
    // payment a member has reported but nobody has confirmed is not money yet.
    .eq('method', 'stripe')
    .eq('status', 'confirmed')
    .gte('paid_at', since.toISOString())

  if (error) {
    console.error('[Reconcile] Failed to load payments:', error.message)
    return Response.json({ error: 'Failed to load payments' }, { status: 500 })
  }

  const ledger: LedgerEntry[] = (
    (rows ?? []) as { id: string; amount: number; stripe_payment_intent_id: string | null }[]
  ).map((row) => ({
    paymentId: row.id,
    paymentIntentId: row.stripe_payment_intent_id,
    amount: Number(row.amount),
  }))

  const charges: StripeCharge[] = []
  try {
    for await (const charge of stripe.charges.list({
      created: { gte: Math.floor(daysAgo(WINDOW_DAYS + OVERLAP_DAYS).getTime() / 1000) },
      limit: 100,
    })) {
      charges.push({
        chargeId: charge.id,
        paymentIntentId:
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : (charge.payment_intent?.id ?? null),
        status: charge.status,
        amountCapturedCents: charge.amount_captured,
        amountRefundedCents: charge.amount_refunded,
        attributed: Boolean(charge.metadata?.balance_id),
      })
      if (charges.length >= MAX_CHARGES) {
        console.warn(`[Reconcile] Stopped at ${MAX_CHARGES} charges; window may be incomplete.`)
        break
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    console.error('[Reconcile] Failed to list charges:', message)
    return Response.json({ error: 'Failed to list charges' }, { status: 500 })
  }

  const report = reconcile({ ledger, charges })

  // Loud on purpose. Nobody watches this endpoint's response body, so the log
  // is the alert — one line per divergence, each naming the intent somebody
  // would have to look up in the Stripe dashboard.
  for (const divergence of report.divergences) {
    console.error(`[Reconcile] ${divergence.kind} ${divergence.paymentIntentId}: ${divergence.detail}`)
  }

  return Response.json({
    ranAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    ...report,
  })
}
