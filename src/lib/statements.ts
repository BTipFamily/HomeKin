// Assembling and sending the emails that tell a member where they stand.
//
// Deliberately not a 'use server' module. Everything here takes a member id and
// emails that member, so exposing it as a server action would hand any signed-in
// user a way to send mail as the app on anyone else's behalf. It is imported by
// server actions and route handlers only.
//
// Nothing here throws. A mail provider having a bad day must not roll back the
// signup or the payment that triggered the email — the same posture as
// `createAnnouncement`. Callers get a result they can report and otherwise
// carry on.

import { sendEmail, type EmailResult } from '@/lib/email'
import {
  buildMemberHistory,
  summarizeHistory,
  type HistoryBalance,
  type HistoryEntry,
  type HistoryEvent,
  type HistoryPayment,
  type HistoryReunion,
  type HistorySignup,
} from '@/lib/member-history'
import {
  buildSchedule,
  scheduleTotals,
  type Deadline,
  type Instalment,
} from '@/lib/payment-schedule'
import { receiptHtml, receiptSubject } from '@/lib/reminder-email'
import {
  statementHtml,
  statementSubject,
  type StatementLine,
  type StatementTotals,
} from '@/lib/statement-email'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Today as 'YYYY-MM-DD', in UTC.
 *
 * UTC rather than the server's local zone so that a deadline behaves the same
 * whether the code runs on a laptop, a Vercel function in Washington, or the
 * cron. A reunion committee setting a date does not care about the hour.
 */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

/** Everything the statement needs, in one round of queries. */
async function loadStatement(memberId: string, reunionId: string) {
  const service = createServiceClient()

  const [{ data: member }, { data: reunion }, { data: events }] = await Promise.all([
    service.from('members').select('id, name, email').eq('id', memberId).maybeSingle(),
    service.from('reunions').select('id, name, year').eq('id', reunionId).maybeSingle(),
    service.from('sub_events').select('id, reunion_id, name, date').eq('reunion_id', reunionId),
  ])

  if (!member || !reunion) return null

  const eventIds = ((events ?? []) as { id: string }[]).map((e) => e.id)

  const [{ data: signups }, { data: balances }, { data: payments }, { data: deadlines }] =
    await Promise.all([
      eventIds.length > 0
        ? service
            .from('signups')
            .select('sub_event_id, headcount, status, created_at')
            .eq('member_id', memberId)
            .in('sub_event_id', eventIds)
        : Promise.resolve({ data: [] }),
      service
        .from('balances')
        .select('id, sub_event_id, reunion_id, amount_owed, amount_paid, status')
        .eq('member_id', memberId)
        .eq('reunion_id', reunionId),
      service
        .from('payments')
        .select('id, balance_id, amount, method, status, paid_at, note')
        .eq('member_id', memberId)
        .eq('reunion_id', reunionId),
      eventIds.length > 0
        ? service
            .from('event_deadlines')
            .select(
              'id, sub_event_id, label, due_date, amount_type, amount_value, reminder_offsets, sort_order'
            )
            .in('sub_event_id', eventIds)
        : Promise.resolve({ data: [] }),
    ])

  return {
    member: member as { id: string; name: string; email: string },
    reunion: reunion as HistoryReunion,
    events: (events ?? []) as HistoryEvent[],
    signups: (signups ?? []) as HistorySignup[],
    balances: (balances ?? []) as HistoryBalance[],
    payments: (payments ?? []) as HistoryPayment[],
    deadlines: (deadlines ?? []) as (Deadline & { sub_event_id: string })[],
  }
}

/** Groups checkpoints by the event they belong to. */
export function deadlinesByEvent(
  deadlines: (Deadline & { sub_event_id: string })[]
): Map<string, Deadline[]> {
  const grouped = new Map<string, Deadline[]>()
  for (const deadline of deadlines) {
    const list = grouped.get(deadline.sub_event_id) ?? []
    list.push(deadline)
    grouped.set(deadline.sub_event_id, list)
  }
  return grouped
}

/**
 * Expands one history entry into its instalments.
 *
 * A general-fund balance has no event and therefore no checkpoints, so it
 * falls through to the single implicit instalment.
 */
export function scheduleForEntry(
  entry: HistoryEntry,
  byEvent: Map<string, Deadline[]>,
  asOf: string
): Instalment[] {
  return buildSchedule({
    amountOwed: entry.amountOwed,
    amountPaid: entry.amountPaid,
    headcount: entry.headcount ?? 1,
    deadlines: entry.eventId ? (byEvent.get(entry.eventId) ?? []) : [],
    asOf,
    fallbackDueDate: entry.eventDate,
  })
}

export type StatementData = {
  memberName: string
  memberEmail: string
  reunionName: string
  lines: StatementLine[]
  totals: StatementTotals
}

/**
 * The statement as data, separately from sending it.
 *
 * Split out so the report and any future preview can show exactly what the
 * member was emailed, rather than a second implementation that drifts.
 */
export async function buildStatement(
  memberId: string,
  reunionId: string,
  asOf = today()
): Promise<StatementData | null> {
  const loaded = await loadStatement(memberId, reunionId)
  if (!loaded) return null

  const entries = buildMemberHistory({
    signups: loaded.signups,
    balances: loaded.balances,
    payments: loaded.payments,
    events: loaded.events,
    reunions: [loaded.reunion],
  }).filter((entry) => entry.reunionId === reunionId)

  if (entries.length === 0) return null

  const byEvent = deadlinesByEvent(loaded.deadlines)
  const lines: StatementLine[] = entries.map((entry) => ({
    eventName: entry.eventName,
    eventDate: entry.eventDate,
    headcount: entry.headcount,
    amountOwed: entry.amountOwed,
    amountPaid: entry.amountPaid,
    outstanding: entry.outstanding,
    credit: entry.credit,
    instalments: scheduleForEntry(entry, byEvent, asOf),
  }))

  const base = summarizeHistory(entries)
  const perEvent = lines.map((line) => scheduleTotals(line.instalments))
  const round = (n: number) => Math.round(n * 100) / 100

  return {
    memberName: loaded.member.name,
    memberEmail: loaded.member.email,
    reunionName: loaded.reunion.name,
    lines,
    totals: {
      totalOwed: base.totalOwed,
      totalPaid: base.totalPaid,
      totalOutstanding: base.totalOutstanding,
      totalCredit: base.totalCredit,
      dueNow: round(perEvent.reduce((sum, t) => sum + t.dueNow, 0)),
      overdue: round(perEvent.reduce((sum, t) => sum + t.overdue, 0)),
    },
  }
}

/**
 * Emails a member their statement for one reunion.
 *
 * Returns `not_configured` untouched when SMTP is unset, so a developer running
 * locally without credentials sees the stub log rather than a false success.
 */
export async function sendStatement(memberId: string, reunionId: string): Promise<EmailResult> {
  const statement = await buildStatement(memberId, reunionId)
  if (!statement) return { sent: false, reason: 'failed', detail: 'Nothing to report' }

  const result = await sendEmail({
    to: statement.memberEmail,
    subject: statementSubject(statement.reunionName, statement.totals),
    html: statementHtml({
      memberName: statement.memberName,
      reunionName: statement.reunionName,
      lines: statement.lines,
      totals: statement.totals,
      payUrl: `${appOrigin()}/reunion/${reunionId}/signups`,
    }),
  })

  if (result.sent) {
    await createServiceClient()
      .from('email_sends')
      .insert({ kind: 'statement', member_id: memberId, reunion_id: reunionId })
  }

  return result
}

/**
 * Acknowledges a payment.
 *
 * The `email_sends` insert comes first and its unique index is the guard: a
 * Stripe webhook redelivery, or a committee member double-clicking Confirm,
 * hits a 23505 and stops before a second email goes out. Sending first and
 * logging afterwards would leave that race open.
 */
export async function sendReceipt(paymentId: string): Promise<EmailResult> {
  const service = createServiceClient()

  const { data: payment } = await service
    .from('payments')
    .select('id, member_id, reunion_id, balance_id, amount, method, status, paid_at')
    .eq('id', paymentId)
    .maybeSingle()

  if (!payment) return { sent: false, reason: 'failed', detail: 'Payment not found' }

  // A refund is a correction between the committee and Stripe, not something to
  // congratulate somebody on receiving.
  if (Number(payment.amount) < 0) {
    return { sent: false, reason: 'failed', detail: 'Refunds are not acknowledged by email' }
  }

  // Only confirmed money is acknowledged. A member who has just reported a Zelle
  // transfer does not need an email repeating what they typed, and telling them
  // it "arrived" before the committee agrees would be a lie.
  if (payment.status !== 'confirmed') {
    return { sent: false, reason: 'failed', detail: 'Payment is not confirmed yet' }
  }

  const { error: logError } = await service.from('email_sends').insert({
    kind: 'payment_receipt',
    member_id: payment.member_id as string,
    reunion_id: payment.reunion_id as string,
    payment_id: payment.id as string,
  })

  // 23505 is the unique index doing its job: this receipt has already gone out.
  if (logError) {
    if (logError.code === '23505') {
      return { sent: false, reason: 'failed', detail: 'Receipt already sent' }
    }
    return { sent: false, reason: 'failed', detail: logError.message }
  }

  const [{ data: member }, { data: reunion }, { data: balance }] = await Promise.all([
    service.from('members').select('name, email').eq('id', payment.member_id).maybeSingle(),
    service.from('reunions').select('name').eq('id', payment.reunion_id).maybeSingle(),
    service
      .from('balances')
      .select('amount_owed, amount_paid, sub_event:sub_event_id(name)')
      .eq('id', payment.balance_id)
      .maybeSingle(),
  ])

  if (!member || !reunion) {
    return { sent: false, reason: 'failed', detail: 'Member or reunion not found' }
  }

  const owed = Number(balance?.amount_owed ?? 0)
  const paid = Number(balance?.amount_paid ?? 0)
  const subEvent = balance?.sub_event as { name: string } | { name: string }[] | null
  const eventName = Array.isArray(subEvent) ? subEvent[0]?.name : subEvent?.name

  const input = {
    memberName: member.name as string,
    reunionName: reunion.name as string,
    eventName: eventName ?? 'General Fund',
    amount: Number(payment.amount),
    method: payment.method as string,
    paidAt: (payment.paid_at as string).slice(0, 10),
    // amount_paid is derived by trigger and already includes this payment, so
    // the difference is what genuinely remains.
    remaining: Math.max(Math.round((owed - paid) * 100) / 100, 0),
    payUrl: `${appOrigin()}/reunion/${payment.reunion_id}/signups`,
  }

  return sendEmail({
    to: member.email as string,
    subject: receiptSubject(input),
    html: receiptHtml(input),
  })
}
