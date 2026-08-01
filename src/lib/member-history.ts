// Assembling a member's reunion history: what they signed up for, what it
// cost, and what they actually paid.
//
// Signups and balances are separate tables that only sometimes line up — a free
// event has a signup and no balance, a general-fund contribution has a balance
// and no signup, and a paid event has both. This merges them into one row per
// thing-that-happened so the profile and the committee report can render the
// same shape. Pure, so it can be unit-tested without a database.

import { toCsv } from '@/lib/csv'
import { formatPaymentMethod } from '@/lib/stripe-payment-method'
import type { PaymentMethod, PaymentStatus, SignupStatus } from '@/types/database'

export type HistorySignup = {
  sub_event_id: string
  headcount: number
  status: SignupStatus
  created_at: string
}

export type HistoryBalance = {
  id: string
  sub_event_id: string | null
  reunion_id: string
  amount_owed: number
  amount_paid: number
  status: string
}

export type HistoryPayment = {
  id: string
  balance_id: string
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  paid_at: string
  note: string | null
  stripe_payment_method?: string | null
}

export type HistoryEvent = {
  id: string
  reunion_id: string
  name: string
  date: string | null
}

export type HistoryReunion = {
  id: string
  name: string
  year: number
}

export type HistoryEntry = {
  /** Stable key for React lists. */
  key: string
  reunionId: string
  reunionName: string
  reunionYear: number
  /** Null for a general-fund balance, which belongs to no particular event. */
  eventId: string | null
  eventName: string
  eventDate: string | null
  /** Null when there is a balance but no signup (a general contribution). */
  headcount: number | null
  signupStatus: SignupStatus | null
  signedUpAt: string | null
  amountOwed: number
  amountPaid: number
  /** Owed minus paid, floored at zero — an overpayment shows in `credit`. */
  outstanding: number
  credit: number
  balanceStatus: string | null
  payments: HistoryPayment[]
}

export type HistoryTotals = {
  events: number
  totalHeadcount: number
  totalOwed: number
  totalPaid: number
  totalOutstanding: number
  totalCredit: number
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Merges signups, balances and payments into one row per event (plus one per
 * general-fund balance), newest reunion first.
 */
export function buildMemberHistory(input: {
  signups: HistorySignup[]
  balances: HistoryBalance[]
  payments: HistoryPayment[]
  events: HistoryEvent[]
  reunions: HistoryReunion[]
}): HistoryEntry[] {
  const eventById = new Map(input.events.map((e) => [e.id, e]))
  const reunionById = new Map(input.reunions.map((r) => [r.id, r]))
  const paymentsByBalance = new Map<string, HistoryPayment[]>()
  for (const payment of input.payments) {
    const list = paymentsByBalance.get(payment.balance_id) ?? []
    list.push(payment)
    paymentsByBalance.set(payment.balance_id, list)
  }

  const balanceByEvent = new Map<string, HistoryBalance>()
  const generalBalances: HistoryBalance[] = []
  for (const balance of input.balances) {
    if (balance.sub_event_id) balanceByEvent.set(balance.sub_event_id, balance)
    else generalBalances.push(balance)
  }

  const entries: HistoryEntry[] = []
  const seenBalanceIds = new Set<string>()

  const paymentsFor = (balanceId: string | null): HistoryPayment[] => {
    if (!balanceId) return []
    return [...(paymentsByBalance.get(balanceId) ?? [])].sort(
      (a, b) => Date.parse(b.paid_at) - Date.parse(a.paid_at)
    )
  }

  // One entry per signup, carrying its balance when the event costs money.
  for (const signup of input.signups) {
    const event = eventById.get(signup.sub_event_id)
    const balance = balanceByEvent.get(signup.sub_event_id) ?? null
    if (balance) seenBalanceIds.add(balance.id)

    const reunionId = event?.reunion_id ?? balance?.reunion_id ?? ''
    const reunion = reunionById.get(reunionId)
    const owed = round(Number(balance?.amount_owed ?? 0))
    const paid = round(Number(balance?.amount_paid ?? 0))

    entries.push({
      key: `signup:${signup.sub_event_id}`,
      reunionId,
      reunionName: reunion?.name ?? 'Unknown reunion',
      reunionYear: reunion?.year ?? 0,
      eventId: signup.sub_event_id,
      eventName: event?.name ?? 'Removed event',
      eventDate: event?.date ?? null,
      headcount: signup.headcount,
      signupStatus: signup.status,
      signedUpAt: signup.created_at,
      amountOwed: owed,
      amountPaid: paid,
      outstanding: round(Math.max(owed - paid, 0)),
      credit: round(Math.max(paid - owed, 0)),
      balanceStatus: balance?.status ?? null,
      payments: paymentsFor(balance?.id ?? null),
    })
  }

  // Balances with no signup behind them: general-fund contributions, or an
  // event balance whose signup was cancelled while money was still owed.
  for (const balance of [...generalBalances, ...input.balances]) {
    if (seenBalanceIds.has(balance.id)) continue
    seenBalanceIds.add(balance.id)

    const event = balance.sub_event_id ? eventById.get(balance.sub_event_id) : null
    const reunion = reunionById.get(balance.reunion_id)
    const owed = round(Number(balance.amount_owed))
    const paid = round(Number(balance.amount_paid))

    entries.push({
      key: `balance:${balance.id}`,
      reunionId: balance.reunion_id,
      reunionName: reunion?.name ?? 'Unknown reunion',
      reunionYear: reunion?.year ?? 0,
      eventId: balance.sub_event_id,
      eventName: balance.sub_event_id ? (event?.name ?? 'Removed event') : 'General Fund',
      eventDate: event?.date ?? null,
      headcount: null,
      signupStatus: null,
      signedUpAt: null,
      amountOwed: owed,
      amountPaid: paid,
      outstanding: round(Math.max(owed - paid, 0)),
      credit: round(Math.max(paid - owed, 0)),
      balanceStatus: balance.status,
      payments: paymentsFor(balance.id),
    })
  }

  return entries.sort(
    (a, b) =>
      b.reunionYear - a.reunionYear ||
      (b.eventDate ?? '').localeCompare(a.eventDate ?? '') ||
      a.eventName.localeCompare(b.eventName)
  )
}

export function summarizeHistory(entries: HistoryEntry[]): HistoryTotals {
  return entries.reduce<HistoryTotals>(
    (totals, entry) => ({
      events: totals.events + (entry.eventId ? 1 : 0),
      totalHeadcount: totals.totalHeadcount + (entry.headcount ?? 0),
      totalOwed: round(totals.totalOwed + entry.amountOwed),
      totalPaid: round(totals.totalPaid + entry.amountPaid),
      totalOutstanding: round(totals.totalOutstanding + entry.outstanding),
      totalCredit: round(totals.totalCredit + entry.credit),
    }),
    {
      events: 0,
      totalHeadcount: 0,
      totalOwed: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      totalCredit: 0,
    }
  )
}

/** Groups entries by reunion for display, newest first. */
export function groupByReunion(
  entries: HistoryEntry[]
): { reunionId: string; reunionName: string; reunionYear: number; entries: HistoryEntry[] }[] {
  const groups = new Map<string, HistoryEntry[]>()
  for (const entry of entries) {
    const list = groups.get(entry.reunionId) ?? []
    list.push(entry)
    groups.set(entry.reunionId, list)
  }

  return [...groups.entries()]
    .map(([reunionId, list]) => ({
      reunionId,
      reunionName: list[0].reunionName,
      reunionYear: list[0].reunionYear,
      entries: list,
    }))
    .sort((a, b) => b.reunionYear - a.reunionYear)
}

// ---------------------------------------------------------------------------
// Report export
// ---------------------------------------------------------------------------

export type ReportRow = HistoryEntry & {
  memberId: string
  memberName: string
  memberEmail: string
  /** Shortfall on checkpoints already due or past — 0 when no deadlines are set. */
  dueNow: number
  overdue: number
  /** The next unsettled checkpoint, or null once everything is paid. */
  nextDueDate: string | null
}

export const REPORT_COLUMNS = [
  'member',
  'email',
  'reunion',
  'year',
  'event',
  'event_date',
  'headcount',
  'signup_status',
  'amount_owed',
  'amount_paid',
  'outstanding',
  'due_now',
  'overdue',
  'next_due_date',
  'balance_status',
  'payments',
] as const

function describePayments(payments: HistoryPayment[]): string {
  return payments
    .map((p) => {
      const when = p.paid_at.slice(0, 10)
      const pending = p.status === 'pending' ? ' (pending)' : ''
      const how = formatPaymentMethod(p.method, p.stripe_payment_method)
      return `${when} ${p.amount < 0 ? '-' : ''}$${Math.abs(p.amount).toFixed(2)} ${how}${pending}`
    })
    .join('; ')
}

/** Flattens report rows to CSV for download. */
export function toReportCsv(rows: ReportRow[]): string {
  return toCsv([
    [...REPORT_COLUMNS],
    ...rows.map((r) => [
      r.memberName,
      r.memberEmail,
      r.reunionName,
      String(r.reunionYear),
      r.eventName,
      r.eventDate ?? '',
      r.headcount === null ? '' : String(r.headcount),
      r.signupStatus ?? '',
      r.amountOwed.toFixed(2),
      r.amountPaid.toFixed(2),
      r.outstanding.toFixed(2),
      r.dueNow.toFixed(2),
      r.overdue.toFixed(2),
      r.nextDueDate ?? '',
      r.balanceStatus ?? '',
      describePayments(r.payments),
    ]),
  ])
}
