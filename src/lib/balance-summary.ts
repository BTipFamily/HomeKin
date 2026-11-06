// What a member still has to pay for a reunion, from their balances.
//
// The balances are the source of truth, not the events' list prices: group
// discounts, guests added after paying and cancellations all land on
// `amount_owed`, and `amount_paid` is derived from confirmed payments. Adding
// up `cost_per_person × headcount` instead — which the signups page used to do —
// showed a fully paid family the whole bill as "Total Owed".
//
// Pure, so the arithmetic that tells someone whether they owe money can be
// tested without a database.

export type BalanceLike = {
  sub_event_id: string | null
  amount_owed: number | string
  amount_paid: number | string
  status: string
}

export type BalanceSummary = {
  /** Everything billed, across every balance. */
  owed: number
  /** Everything confirmed as paid, refunds already netted off. */
  paid: number
  /** What is still due. Never negative: one overpaid balance does not pay another. */
  outstanding: number
  /** Paid beyond what was owed — usually a cancelled event awaiting a refund. */
  credit: number
  /** A reported payment is waiting on the committee, so `outstanding` may be about to drop. */
  awaitingConfirmation: boolean
  /** Owed on balances not tied to an event, which the per-event list does not show. */
  unattachedOwed: number
}

/** Money as numbers, rounded to the cent so float noise never shows as "$0.00 due". */
function cents(value: number | string): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

export function summarizeBalances(balances: BalanceLike[]): BalanceSummary {
  let owed = 0
  let paid = 0
  let outstanding = 0
  let credit = 0
  let unattachedOwed = 0
  let awaitingConfirmation = false

  for (const b of balances) {
    const o = cents(b.amount_owed)
    const p = cents(b.amount_paid)
    owed += o
    paid += p
    // Per balance, not on the totals: a refund owed on a cancelled event is not
    // a payment towards a different one.
    outstanding += Math.max(0, o - p)
    credit += Math.max(0, p - o)
    if (b.sub_event_id === null) unattachedOwed += o
    if (b.status === 'pending_confirmation') awaitingConfirmation = true
  }

  const round = (n: number) => Math.round(n * 100) / 100
  return {
    owed: round(owed),
    paid: round(paid),
    outstanding: round(outstanding),
    credit: round(credit),
    awaitingConfirmation,
    unattachedOwed: round(unattachedOwed),
  }
}
