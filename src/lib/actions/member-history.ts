'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  rollupByDeadline,
  scheduleTotals,
  type Deadline,
  type DeadlineRollup,
  type Instalment,
} from '@/lib/payment-schedule'
import { deadlinesByEvent, scheduleForEntry, today } from '@/lib/statements'
import {
  buildMemberHistory,
  summarizeHistory,
  toReportCsv,
  type HistoryBalance,
  type HistoryEntry,
  type HistoryEvent,
  type HistoryPayment,
  type HistoryReunion,
  type HistorySignup,
  type HistoryTotals,
  type ReportRow,
} from '@/lib/member-history'

async function currentMember(): Promise<{ id: string; role: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await supabase
    .from('members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) throw new Error('Member not found')
  return member as { id: string; role: string }
}

/** Reference data shared by every history query. */
async function loadContext(): Promise<{ events: HistoryEvent[]; reunions: HistoryReunion[] }> {
  const service = createServiceClient()
  const [{ data: events }, { data: reunions }] = await Promise.all([
    service.from('sub_events').select('id, reunion_id, name, date'),
    service.from('reunions').select('id, name, year'),
  ])
  return {
    events: (events ?? []) as HistoryEvent[],
    reunions: (reunions ?? []) as HistoryReunion[],
  }
}

export type MemberHistory = { entries: HistoryEntry[]; totals: HistoryTotals }

/**
 * One member's full history across every reunion.
 *
 * Visible to the member themselves and to committee/admin. Anyone else asking
 * gets a refusal rather than an empty list, so the caller cannot mistake "not
 * allowed" for "nothing to show".
 */
export async function getMemberHistory(memberId: string): Promise<MemberHistory> {
  const viewer = await currentMember()
  const isPrivileged = ['committee', 'admin'].includes(viewer.role)
  if (viewer.id !== memberId && !isPrivileged) {
    throw new Error('You can only view your own history.')
  }

  const service = createServiceClient()
  const [{ data: signups }, { data: balances }, { data: payments }, context] = await Promise.all([
    service
      .from('signups')
      .select('sub_event_id, headcount, status, created_at')
      .eq('member_id', memberId),
    service
      .from('balances')
      .select('id, sub_event_id, reunion_id, amount_owed, amount_paid, status')
      .eq('member_id', memberId),
    service
      .from('payments')
      .select('id, balance_id, amount, method, status, paid_at, note, stripe_payment_method')
      .eq('member_id', memberId),
    loadContext(),
  ])

  const entries = buildMemberHistory({
    signups: (signups ?? []) as HistorySignup[],
    balances: (balances ?? []) as HistoryBalance[],
    payments: (payments ?? []) as HistoryPayment[],
    ...context,
  })

  return { entries, totals: summarizeHistory(entries) }
}

export type ReunionReport = {
  reunionName: string
  rows: ReportRow[]
  totals: HistoryTotals
  /** Per-member roll-up for the summary table. */
  byMember: {
    memberId: string
    memberName: string
    memberEmail: string
    events: number
    headcount: number
    owed: number
    paid: number
    outstanding: number
    /** Shortfall on checkpoints already due — what to chase today. */
    dueNow: number
    overdue: number
  }[]
  /** Every payment checkpoint in the reunion, with who has met it. */
  deadlines: (DeadlineRollup & { eventName: string })[]
}

/**
 * Every member's signups and payments for one reunion.
 *
 * Loads the reunion's rows in four queries rather than one per member, since a
 * directory of a few hundred people would otherwise mean a few hundred
 * round-trips.
 */
export async function getReunionReport(reunionId: string): Promise<ReunionReport> {
  const viewer = await currentMember()
  if (!['committee', 'admin'].includes(viewer.role)) {
    throw new Error('Committee or admin access required')
  }

  const service = createServiceClient()
  const context = await loadContext()
  const eventIds = context.events.filter((e) => e.reunion_id === reunionId).map((e) => e.id)
  const reunion = context.reunions.find((r) => r.id === reunionId)
  if (!reunion) throw new Error('That reunion no longer exists.')

  const [
    { data: signups },
    { data: balances },
    { data: payments },
    { data: members },
    { data: deadlineRows },
  ] = await Promise.all([
    eventIds.length > 0
      ? service
          .from('signups')
          .select('member_id, sub_event_id, headcount, status, created_at')
          .in('sub_event_id', eventIds)
      : Promise.resolve({ data: [] }),
    service
      .from('balances')
      .select('id, member_id, sub_event_id, reunion_id, amount_owed, amount_paid, status')
      .eq('reunion_id', reunionId),
    service
      .from('payments')
      .select(
        'id, member_id, balance_id, amount, method, status, paid_at, note, stripe_payment_method'
      )
      .eq('reunion_id', reunionId),
    service.from('members').select('id, name, email').order('name'),
    eventIds.length > 0
      ? service
          .from('event_deadlines')
          .select(
            'id, sub_event_id, label, due_date, amount_type, amount_value, reminder_offsets, sort_order'
          )
          .in('sub_event_id', eventIds)
      : Promise.resolve({ data: [] }),
  ])

  const asOf = today()
  const byEvent = deadlinesByEvent((deadlineRows ?? []) as (Deadline & { sub_event_id: string })[])
  const allInstalments: Instalment[] = []

  type WithMember = { member_id: string }
  const signupsByMember = new Map<string, HistorySignup[]>()
  for (const s of (signups ?? []) as (HistorySignup & WithMember)[]) {
    const list = signupsByMember.get(s.member_id) ?? []
    list.push(s)
    signupsByMember.set(s.member_id, list)
  }

  const balancesByMember = new Map<string, HistoryBalance[]>()
  for (const b of (balances ?? []) as (HistoryBalance & WithMember)[]) {
    const list = balancesByMember.get(b.member_id) ?? []
    list.push(b)
    balancesByMember.set(b.member_id, list)
  }

  const paymentsByMember = new Map<string, HistoryPayment[]>()
  for (const p of (payments ?? []) as (HistoryPayment & WithMember)[]) {
    const list = paymentsByMember.get(p.member_id) ?? []
    list.push(p)
    paymentsByMember.set(p.member_id, list)
  }

  const rows: ReportRow[] = []
  const byMember: ReunionReport['byMember'] = []

  for (const member of (members ?? []) as { id: string; name: string; email: string }[]) {
    const memberSignups = signupsByMember.get(member.id) ?? []
    const memberBalances = balancesByMember.get(member.id) ?? []
    if (memberSignups.length === 0 && memberBalances.length === 0) continue

    const entries = buildMemberHistory({
      signups: memberSignups,
      balances: memberBalances,
      payments: paymentsByMember.get(member.id) ?? [],
      ...context,
    }).filter((e) => e.reunionId === reunionId)

    if (entries.length === 0) continue

    let memberDueNow = 0
    let memberOverdue = 0

    for (const entry of entries) {
      // The same expansion the statement email uses, so the report and the
      // email a member received can never disagree about what they owe.
      const instalments = scheduleForEntry(entry, byEvent, asOf)
      allInstalments.push(...instalments)
      const scheduled = scheduleTotals(instalments)
      memberDueNow += scheduled.dueNow
      memberOverdue += scheduled.overdue

      rows.push({
        ...entry,
        memberId: member.id,
        memberName: member.name,
        memberEmail: member.email,
        dueNow: scheduled.dueNow,
        overdue: scheduled.overdue,
        nextDueDate: scheduled.nextDueDate,
      })
    }

    const totals = summarizeHistory(entries)
    const round = (n: number) => Math.round(n * 100) / 100
    byMember.push({
      memberId: member.id,
      memberName: member.name,
      memberEmail: member.email,
      events: totals.events,
      headcount: totals.totalHeadcount,
      owed: totals.totalOwed,
      paid: totals.totalPaid,
      outstanding: totals.totalOutstanding,
      dueNow: round(memberDueNow),
      overdue: round(memberOverdue),
    })
  }

  const eventNameByDeadline = new Map<string, string>()
  for (const [eventId, deadlines] of byEvent) {
    const eventName = context.events.find((e) => e.id === eventId)?.name ?? 'Removed event'
    for (const deadline of deadlines) eventNameByDeadline.set(deadline.id, eventName)
  }

  return {
    reunionName: reunion.name,
    rows,
    totals: summarizeHistory(rows),
    byMember: byMember.sort((a, b) => b.outstanding - a.outstanding || a.memberName.localeCompare(b.memberName)),
    deadlines: rollupByDeadline(allInstalments).map((rollup) => ({
      ...rollup,
      eventName: eventNameByDeadline.get(rollup.deadlineId) ?? 'Removed event',
    })),
  }
}

/** The same report as a CSV string, for the download button. */
export async function getReunionReportCsv(reunionId: string): Promise<string> {
  const report = await getReunionReport(reunionId)
  return toReportCsv(report.rows)
}
