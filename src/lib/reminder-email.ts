// Two short emails about one number: a nudge before a payment deadline, and an
// acknowledgement after a payment lands.
//
// Deliberately not statements. A reminder that restated every selection would
// bury the one thing it exists to say — this much, by this date — and a receipt
// is read to confirm a single figure arrived.

import {
  button,
  emailShell,
  escapeHtml,
  formatDate,
  formatMoney,
  note,
  totalRow,
  totals as totalsTable,
} from '@/lib/email-layout'

// ---------------------------------------------------------------------------
// Deadline reminder
// ---------------------------------------------------------------------------

export type ReminderInput = {
  memberName: string | null
  reunionName: string
  eventName: string
  /** The checkpoint's own name, e.g. 'Deposit'. */
  label: string
  dueDate: string
  /** What is still missing from this checkpoint. */
  shortfall: number
  /** Everything still owed for this event, this checkpoint included. */
  eventOutstanding: number
  /** Negative when the date has already passed. */
  daysUntilDue: number
  payUrl: string
}

/** 'in 14 days', 'tomorrow', 'today', '3 days ago'. */
function whenPhrase(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 0) return `in ${days} days`
  return `${Math.abs(days)} days ago`
}

export function reminderSubject(input: ReminderInput): string {
  const overdue = input.daysUntilDue < 0
  return overdue
    ? `${input.reunionName}: ${formatMoney(input.shortfall)} was due ${whenPhrase(input.daysUntilDue)}`
    : `${input.reunionName}: ${formatMoney(input.shortfall)} due ${whenPhrase(input.daysUntilDue)}`
}

export function reminderHtml(input: ReminderInput): string {
  const greeting = input.memberName?.trim()
    ? `Hi ${escapeHtml(input.memberName.trim())},`
    : 'Hi,'
  const overdue = input.daysUntilDue < 0

  const opener = overdue
    ? `<strong>${escapeHtml(input.label)}</strong> for ${escapeHtml(input.eventName)} was due on ${escapeHtml(formatDate(input.dueDate))}, ${escapeHtml(whenPhrase(input.daysUntilDue))}.`
    : `<strong>${escapeHtml(input.label)}</strong> for ${escapeHtml(input.eventName)} is due ${escapeHtml(whenPhrase(input.daysUntilDue))}, on ${escapeHtml(formatDate(input.dueDate))}.`

  const rows = [
    totalRow('Due at this deadline', formatMoney(input.shortfall), true),
    input.eventOutstanding > input.shortfall
      ? totalRow('Total still owed for this event', formatMoney(input.eventOutstanding))
      : '',
  ]
    .filter(Boolean)
    .join('')

  const body = `
    <p style="font-size:15px;line-height:1.5;margin:0 0 16px;">${greeting}</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 4px;">${opener}</p>
    ${totalsTable(rows)}
    ${button(input.payUrl, 'Pay now')}
    ${note(
      'If you have already sent this payment another way, you can ignore this — it may not have been recorded yet. Otherwise, reply to this email if you need to arrange something different.'
    )}
  `

  return emailShell({
    title: overdue ? 'A payment is overdue' : 'A payment is coming up',
    eyebrow: `${input.reunionName} — ${input.eventName}`,
    preheader: `${formatMoney(input.shortfall)} due ${whenPhrase(input.daysUntilDue)}.`,
    body,
  })
}

// ---------------------------------------------------------------------------
// Payment receipt
// ---------------------------------------------------------------------------

/**
 * Only ever built for a *confirmed* payment.
 *
 * A member reporting a Zelle transfer is not emailed a receipt for it — they
 * just typed it in, and telling them the committee has agreed it arrived is the
 * message worth sending. That also keeps one receipt per payment, which is what
 * the unique index on email_sends.payment_id enforces.
 */
export type ReceiptInput = {
  memberName: string | null
  reunionName: string
  /** 'General Fund' when the balance belongs to no particular event. */
  eventName: string
  amount: number
  method: string
  paidAt: string
  /** What remains on that balance after this payment. */
  remaining: number
  payUrl: string
}

const METHOD_LABEL: Record<string, string> = {
  stripe: 'Card',
  zelle: 'Zelle',
  cashapp: 'Cash App',
  check: 'Check',
  other: 'Other',
}

export function receiptSubject(input: ReceiptInput): string {
  return `${input.reunionName}: ${formatMoney(input.amount)} received`
}

export function receiptHtml(input: ReceiptInput): string {
  const greeting = input.memberName?.trim()
    ? `Hi ${escapeHtml(input.memberName.trim())},`
    : 'Hi,'

  const opener = `Thanks — your ${escapeHtml(formatMoney(input.amount))} payment for ${escapeHtml(input.eventName)} has been received.`

  const rows = [
    totalRow('Amount', formatMoney(input.amount), true),
    totalRow('Method', METHOD_LABEL[input.method] ?? input.method),
    totalRow('Date', formatDate(input.paidAt)),
    totalRow('Still outstanding', formatMoney(input.remaining)),
  ].join('')

  const body = `
    <p style="font-size:15px;line-height:1.5;margin:0 0 16px;">${greeting}</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 4px;">${opener}</p>
    ${totalsTable(rows)}
    ${
      input.remaining > 0
        ? button(input.payUrl, 'Pay the rest')
        : button(input.payUrl, 'View my signups')
    }
    ${note('Keep this email for your records.')}
  `

  return emailShell({
    title: 'Payment received',
    eyebrow: `${input.reunionName} — ${input.eventName}`,
    preheader: `${formatMoney(input.amount)} — ${formatMoney(input.remaining)} still outstanding.`,
    body,
  })
}
