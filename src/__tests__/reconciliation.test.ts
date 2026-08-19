// Does the ledger still agree with Stripe?
//
// The four ways it can stop agreeing are a payment Stripe took and the webhook
// never recorded, a refund the same, a ledger row for money that was never
// taken, and a row somebody edited. All four have to be caught by the same
// equation, because the job cannot know which one it is looking at.

import {
  reconcile,
  type LedgerEntry,
  type StripeCharge,
} from '@/lib/reconciliation'

const PI = 'pi_1'

function charge(overrides: Partial<StripeCharge> = {}): StripeCharge {
  return {
    chargeId: 'ch_1',
    paymentIntentId: PI,
    status: 'succeeded',
    amountCapturedCents: 10000,
    amountRefundedCents: 0,
    attributed: true,
    ...overrides,
  }
}

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    paymentId: 'p_1',
    paymentIntentId: PI,
    amount: 100,
    ...overrides,
  }
}

describe('reconcile', () => {
  it('finds nothing wrong when both sides agree', () => {
    const report = reconcile({ ledger: [entry()], charges: [charge()] })

    expect(report.divergences).toEqual([])
    expect(report.checked).toBe(1)
  })

  it('nets a recorded refund against the charge it reverses', () => {
    const report = reconcile({
      ledger: [entry(), entry({ paymentId: 'p_2', amount: -40 })],
      charges: [charge({ amountRefundedCents: 4000 })],
    })

    expect(report.divergences).toEqual([])
  })

  it('catches a refund taken at Stripe that never reached the ledger', () => {
    const report = reconcile({
      ledger: [entry()],
      charges: [charge({ amountRefundedCents: 4000 })],
    })

    expect(report.divergences).toHaveLength(1)
    expect(report.divergences[0].kind).toBe('amount_mismatch')
    expect(report.divergences[0].detail).toContain('$60.00')
    expect(report.divergences[0].detail).toContain('$100.00')
  })

  it('catches a payment Stripe took that the webhook never recorded', () => {
    const report = reconcile({ ledger: [], charges: [charge()] })

    expect(report.divergences).toHaveLength(1)
    expect(report.divergences[0].kind).toBe('missing_in_ledger')
    expect(report.divergences[0].paymentIntentId).toBe(PI)
  })

  it('catches a ledger row for a charge Stripe has never heard of', () => {
    const report = reconcile({ ledger: [entry()], charges: [] })

    expect(report.divergences).toHaveLength(1)
    expect(report.divergences[0].kind).toBe('missing_at_stripe')
  })

  // The deliberately corrupted row: somebody edits the amount in the database
  // and nothing else changes. Neither side is missing, so only the arithmetic
  // can find it.
  it('catches an amount that has been altered by hand', () => {
    const report = reconcile({
      ledger: [entry({ amount: 250 })],
      charges: [charge()],
    })

    expect(report.divergences).toHaveLength(1)
    expect(report.divergences[0].kind).toBe('amount_mismatch')
    expect(report.divergences[0].detail).toContain('$250.00')
  })

  it('catches money counted against a charge that never succeeded', () => {
    const report = reconcile({
      ledger: [entry()],
      charges: [charge({ status: 'failed', amountCapturedCents: 0 })],
    })

    expect(report.divergences).toHaveLength(1)
    expect(report.divergences[0].kind).toBe('not_succeeded')
  })

  it('says nothing about a failed attempt nobody recorded', () => {
    const report = reconcile({
      ledger: [],
      charges: [charge({ status: 'failed', amountCapturedCents: 0 })],
    })

    expect(report.divergences).toEqual([])
  })

  it('counts a fully refunded charge as settled once both refunds are recorded', () => {
    const report = reconcile({
      ledger: [
        entry(),
        entry({ paymentId: 'p_2', amount: -60 }),
        entry({ paymentId: 'p_3', amount: -40 }),
      ],
      charges: [charge({ amountRefundedCents: 10000 })],
    })

    expect(report.divergences).toEqual([])
  })

  // One intent, a declined attempt and then a successful one. Only the money
  // that was actually taken counts.
  it('sums the succeeded charges on an intent that was retried', () => {
    const report = reconcile({
      ledger: [entry()],
      charges: [
        charge({ chargeId: 'ch_failed', status: 'failed', amountCapturedCents: 0 }),
        charge({ chargeId: 'ch_ok' }),
      ],
    })

    expect(report.divergences).toEqual([])
  })

  it('counts rows with no intent id as unverifiable rather than missing', () => {
    const report = reconcile({
      ledger: [entry({ paymentIntentId: null })],
      charges: [],
    })

    expect(report.unverifiable).toBe(1)
    expect(report.divergences).toEqual([])
  })

  // A Stripe account the family also uses for something else. Alerting on
  // every unrelated charge would train everybody to ignore the alert.
  it('does not report an unattributed charge as a lost payment', () => {
    const report = reconcile({
      ledger: [],
      charges: [charge({ attributed: false })],
    })

    expect(report.unattributed).toBe(1)
    expect(report.divergences).toEqual([])
  })

  it('still reports an attributed charge among unattributed ones', () => {
    const report = reconcile({
      ledger: [],
      charges: [
        charge({ chargeId: 'ch_other', paymentIntentId: 'pi_other', attributed: false }),
        charge(),
      ],
    })

    expect(report.unattributed).toBe(1)
    expect(report.divergences).toHaveLength(1)
    expect(report.divergences[0].paymentIntentId).toBe(PI)
  })

  // numeric(10,2) round-trips through JS as a float, so the comparison has to
  // happen in cents or a perfectly good ledger reports a one-cent divergence.
  it('does not invent a divergence out of floating point', () => {
    const report = reconcile({
      ledger: [entry({ amount: 0.29 }), entry({ paymentId: 'p_2', amount: 0.28 })],
      charges: [charge({ amountCapturedCents: 57 })],
    })

    expect(report.divergences).toEqual([])
  })
})
