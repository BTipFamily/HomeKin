// The statement: everything a member has signed up for, what it costs, what
// they have paid, and what is still due.
//
// Pure, so the wording and the arithmetic can be tested without a database or
// a mail server. The figures come from `buildMemberHistory` and
// `buildSchedule`; nothing is recomputed here.

import {
  button,
  emailShell,
  escapeHtml,
  formatDate,
  formatMoney,
  heading,
  note,
  table,
  totalRow,
  totals as totalsTable,
} from '@/lib/email-layout'
import type { Instalment } from '@/lib/payment-schedule'

export type StatementLine = {
  eventName: string
  eventDate: string | null
  /** Null for a general-fund balance, which nobody "attends". */
  headcount: number | null
  amountOwed: number
  amountPaid: number
  outstanding: number
  credit: number
  instalments: Instalment[]
}

export type StatementTotals = {
  totalOwed: number
  totalPaid: number
  totalOutstanding: number
  totalCredit: number
  dueNow: number
  overdue: number
}

const STATUS_LABEL: Record<Instalment['status'], string> = {
  paid: 'Paid',
  due: 'Due now',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
}

const STATUS_COLOR: Record<Instalment['status'], string> = {
  paid: '#15803d',
  due: '#b45309',
  overdue: '#b91c1c',
  upcoming: '#666',
}

function statusBadge(status: Instalment['status']): string {
  return `<span style="color:${STATUS_COLOR[status]};font-weight:600;">${STATUS_LABEL[status]}</span>`
}

/** The selections table — one row per event, plus any general-fund balance. */
function selectionsTable(lines: StatementLine[]): string {
  return table(
    [
      { label: 'Event' },
      { label: 'People', align: 'right' },
      { label: 'Cost', align: 'right' },
      { label: 'Paid', align: 'right' },
      { label: 'Outstanding', align: 'right' },
    ],
    lines.map((line) => [
      `<strong>${escapeHtml(line.eventName)}</strong>${
        line.eventDate
          ? `<br><span style="color:#666;font-size:13px;">${escapeHtml(formatDate(line.eventDate))}</span>`
          : ''
      }`,
      line.headcount === null ? '—' : String(line.headcount),
      escapeHtml(formatMoney(line.amountOwed)),
      escapeHtml(formatMoney(line.amountPaid)),
      line.credit > 0
        ? `<span style="color:#15803d;">${escapeHtml(formatMoney(line.credit))} credit</span>`
        : escapeHtml(formatMoney(line.outstanding)),
    ])
  )
}

/**
 * The payment schedule for one event.
 *
 * Only rendered when the committee actually set checkpoints — the implicit
 * single instalment an event without them produces would just restate the row
 * above it.
 */
function scheduleTable(line: StatementLine): string {
  // An event with no checkpoints produces a single implicit instalment, which
  // would only restate the row above it. One real checkpoint is enough to make
  // the table worth showing — and then every instalment appears, including the
  // trailing "Remaining balance" the checkpoints did not cover.
  if (!line.instalments.some((i) => i.deadlineId !== null)) return ''

  return `
    ${heading(`${line.eventName}: payment schedule`)}
    ${table(
      [
        { label: 'Due by' },
        { label: 'What for' },
        { label: 'Amount', align: 'right' },
        { label: 'Status', align: 'right' },
      ],
      line.instalments.map((instalment) => [
        instalment.dueDate ? escapeHtml(formatDate(instalment.dueDate)) : 'Before the event',
        escapeHtml(instalment.label),
        escapeHtml(formatMoney(instalment.amountDue)),
        instalment.shortfall > 0 && instalment.applied > 0
          ? `${statusBadge(instalment.status)}<br><span style="color:#666;font-size:13px;">${escapeHtml(formatMoney(instalment.shortfall))} short</span>`
          : statusBadge(instalment.status),
      ])
    )}
  `
}

function totalsBlock(t: StatementTotals): string {
  const rows = [
    totalRow('Total cost', formatMoney(t.totalOwed)),
    totalRow('Paid so far', formatMoney(t.totalPaid)),
    t.totalCredit > 0 ? totalRow('Credit', formatMoney(t.totalCredit)) : '',
    totalRow('Still outstanding', formatMoney(t.totalOutstanding), true),
  ]
    .filter(Boolean)
    .join('')

  return totalsTable(rows)
}

/**
 * What to say at the top, which depends entirely on whether they owe anything.
 *
 * A member who has paid in full should not open an email that leads with a
 * payment demand, and a member who is late should not have to read to the
 * bottom to find that out.
 */
function lead(t: StatementTotals): string {
  if (t.totalOutstanding <= 0) {
    return 'You are all paid up — nothing is outstanding. Here is a summary of everything you are signed up for.'
  }
  if (t.overdue > 0) {
    return `Here is where your reunion plans stand. <strong>${escapeHtml(formatMoney(t.overdue))} is past its due date.</strong>`
  }
  if (t.dueNow > 0) {
    return `Here is where your reunion plans stand. <strong>${escapeHtml(formatMoney(t.dueNow))} is due now.</strong>`
  }
  return 'Here is where your reunion plans stand, including when the remaining payments are due.'
}

export function statementSubject(reunionName: string, t: StatementTotals): string {
  if (t.totalOutstanding <= 0) return `${reunionName}: your signups — paid in full`
  if (t.overdue > 0) {
    return `${reunionName}: ${formatMoney(t.overdue)} overdue`
  }
  return `${reunionName}: your signups and ${formatMoney(t.totalOutstanding)} outstanding`
}

export function statementHtml(input: {
  memberName: string | null
  reunionName: string
  lines: StatementLine[]
  totals: StatementTotals
  payUrl: string
}): string {
  const greeting = input.memberName?.trim()
    ? `Hi ${escapeHtml(input.memberName.trim())},`
    : 'Hi,'

  const schedules = input.lines.map(scheduleTable).filter(Boolean).join('')

  const body = `
    <p style="font-size:15px;line-height:1.5;margin:0 0 16px;">${greeting}</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 20px;">${lead(input.totals)}</p>

    ${heading('Your selections')}
    ${selectionsTable(input.lines)}
    ${totalsBlock(input.totals)}

    ${schedules}

    ${
      input.totals.totalOutstanding > 0
        ? button(input.payUrl, 'Pay now')
        : button(input.payUrl, 'View my signups')
    }

    ${note(
      'This is an automatic summary sent whenever your selections change. If anything looks wrong, reply to this email or speak to the reunion committee.'
    )}
  `

  return emailShell({
    title: input.totals.totalOutstanding > 0 ? 'Your reunion statement' : 'Your reunion summary',
    eyebrow: input.reunionName,
    preheader:
      input.totals.totalOutstanding > 0
        ? `${formatMoney(input.totals.totalOutstanding)} outstanding across ${input.lines.length} item${input.lines.length === 1 ? '' : 's'}.`
        : 'Everything is paid up.',
    body,
  })
}
