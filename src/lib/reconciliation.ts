// Comparing what the ledger believes against what Stripe actually did.
//
// The webhook is the only thing that writes a card payment, which makes it a
// single point of failure: an event Stripe never manages to deliver, a handler
// that threw on a bad day, a refund somebody issued from the Stripe dashboard
// before this app knew how to hear about one. None of those announce
// themselves. The ledger simply goes quietly wrong, and the first anybody knows
// is a member insisting they paid.
//
// This module holds the comparison and nothing else — no Supabase, no Stripe
// client — so the arithmetic that decides whether the family's money adds up
// can be tested directly rather than against a sandbox.
//
// It deliberately reports and never repairs. Writing a payment from a second
// place is the exact shape of the bug migration 015 removed, and a nightly job
// silently inventing money is worse than a nightly job saying it does not
// balance.

/** One row of the ledger, as `payments` stores it: dollars, refunds negative. */
export type LedgerEntry = {
  paymentId: string
  /** Null on payments taken before the intent id was recorded. Unverifiable. */
  paymentIntentId: string | null
  amount: number
}

/** One charge at Stripe, in cents, as Stripe reports it. */
export type StripeCharge = {
  chargeId: string
  paymentIntentId: string | null
  /** Stripe's own charge status: 'succeeded', 'pending' or 'failed'. */
  status: string
  amountCapturedCents: number
  amountRefundedCents: number
  /** True when the charge carries this app's metadata, so it is ours to explain. */
  attributed: boolean
}

export type DivergenceKind =
  /** Stripe took money this app has no record of. A dropped webhook. */
  | 'missing_in_ledger'
  /** The ledger claims a card payment Stripe has no charge for. */
  | 'missing_at_stripe'
  /** Both know about it and disagree on how much. */
  | 'amount_mismatch'
  /** The ledger counted money from a charge that did not succeed. */
  | 'not_succeeded'

export type Divergence = {
  kind: DivergenceKind
  paymentIntentId: string
  detail: string
}

export type ReconciliationReport = {
  /** Payment intents compared on both sides. */
  checked: number
  /** Ledger rows with no intent id — too old to check, not a problem. */
  unverifiable: number
  /**
   * Succeeded charges that are neither ours nor in the ledger. On a Stripe
   * account the family also uses for something else this is ordinary, and on a
   * charge taken before metadata was attached it is expected, so it is counted
   * rather than alerted on.
   */
  unattributed: number
  divergences: Divergence[]
}

/** Dollars to cents, once, so every comparison below is integer arithmetic. */
function cents(dollars: number): number {
  return Math.round(dollars * 100)
}

function formatCents(value: number): string {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

type ChargeGroup = {
  capturedCents: number
  refundedCents: number
  succeeded: boolean
  attributed: boolean
}

/**
 * Charges collapsed onto their payment intent.
 *
 * An intent can carry more than one charge — a declined attempt followed by a
 * successful one — and only the succeeded charges are money. A group that
 * succeeded nowhere still gets an entry, so a ledger row pointing at it can be
 * called out rather than silently treated as missing from Stripe.
 */
function groupCharges(charges: StripeCharge[]): Map<string, ChargeGroup> {
  const groups = new Map<string, ChargeGroup>()

  for (const charge of charges) {
    if (!charge.paymentIntentId) continue

    const group = groups.get(charge.paymentIntentId) ?? {
      capturedCents: 0,
      refundedCents: 0,
      succeeded: false,
      attributed: false,
    }

    if (charge.status === 'succeeded') {
      group.capturedCents += charge.amountCapturedCents
      group.refundedCents += charge.amountRefundedCents
      group.succeeded = true
    }
    group.attributed ||= charge.attributed

    groups.set(charge.paymentIntentId, group)
  }

  return groups
}

/**
 * Everything the two sides disagree about.
 *
 * The ledger's net for an intent — the payment less any refunds recorded
 * against it — must equal what Stripe captured less what Stripe refunded. That
 * one equation catches all four failure modes: a payment never recorded, a
 * refund never recorded, a payment recorded that never happened, and a row
 * edited by hand.
 */
export function reconcile(args: {
  ledger: LedgerEntry[]
  charges: StripeCharge[]
}): ReconciliationReport {
  const groups = groupCharges(args.charges)

  const ledgerByIntent = new Map<string, number>()
  let unverifiable = 0

  for (const entry of args.ledger) {
    if (!entry.paymentIntentId) {
      unverifiable += 1
      continue
    }
    ledgerByIntent.set(
      entry.paymentIntentId,
      (ledgerByIntent.get(entry.paymentIntentId) ?? 0) + cents(entry.amount)
    )
  }

  const divergences: Divergence[] = []
  let unattributed = 0

  for (const [paymentIntentId, group] of groups) {
    const expected = group.capturedCents - group.refundedCents
    const recorded = ledgerByIntent.get(paymentIntentId)

    if (recorded === undefined) {
      // Nothing was captured and nothing was recorded: an abandoned or failed
      // attempt, which is not a divergence.
      if (!group.succeeded || expected === 0) continue

      if (!group.attributed) {
        unattributed += 1
        continue
      }

      divergences.push({
        kind: 'missing_in_ledger',
        paymentIntentId,
        detail: `Stripe captured ${formatCents(expected)} that the ledger has no payment for.`,
      })
      continue
    }

    if (!group.succeeded) {
      divergences.push({
        kind: 'not_succeeded',
        paymentIntentId,
        detail: `The ledger records ${formatCents(recorded)} against a charge that never succeeded.`,
      })
      continue
    }

    if (recorded !== expected) {
      divergences.push({
        kind: 'amount_mismatch',
        paymentIntentId,
        detail: `Stripe settled ${formatCents(expected)}; the ledger records ${formatCents(recorded)}.`,
      })
    }
  }

  for (const [paymentIntentId, recorded] of ledgerByIntent) {
    if (groups.has(paymentIntentId)) continue
    divergences.push({
      kind: 'missing_at_stripe',
      paymentIntentId,
      detail: `The ledger records ${formatCents(recorded)} against a charge Stripe has no record of.`,
    })
  }

  return {
    checked: new Set([...groups.keys(), ...ledgerByIntent.keys()]).size,
    unverifiable,
    unattributed,
    divergences,
  }
}
