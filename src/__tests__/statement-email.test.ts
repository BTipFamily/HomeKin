// The emails a member actually receives. What matters here is that the figures
// shown are the ones passed in, that user-supplied text cannot break out into
// markup, and that the wording matches the member's situation — an email
// demanding payment from someone who has paid in full is worse than no email.

import { formatDate, formatMoney } from '@/lib/email-layout'
import {
  reminderHtml,
  reminderSubject,
  receiptHtml,
  receiptSubject,
  type ReceiptInput,
  type ReminderInput,
} from '@/lib/reminder-email'
import {
  statementHtml,
  statementSubject,
  type StatementLine,
  type StatementTotals,
} from '@/lib/statement-email'
import type { Instalment } from '@/lib/payment-schedule'

function instalment(overrides: Partial<Instalment> = {}): Instalment {
  return {
    deadlineId: 'd1',
    label: 'Deposit',
    dueDate: '2026-03-01',
    amountDue: 100,
    cumulativeRequired: 100,
    applied: 0,
    shortfall: 100,
    status: 'upcoming',
    ...overrides,
  }
}

function line(overrides: Partial<StatementLine> = {}): StatementLine {
  return {
    eventName: 'Banquet',
    eventDate: '2026-08-01',
    headcount: 2,
    amountOwed: 200,
    amountPaid: 0,
    outstanding: 200,
    credit: 0,
    instalments: [instalment()],
    ...overrides,
  }
}

function totals(overrides: Partial<StatementTotals> = {}): StatementTotals {
  return {
    totalOwed: 200,
    totalPaid: 0,
    totalOutstanding: 200,
    totalCredit: 0,
    dueNow: 0,
    overdue: 0,
    ...overrides,
  }
}

describe('formatting helpers', () => {
  test('money carries a thousands separator and two decimals', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50')
    expect(formatMoney(0)).toBe('$0.00')
  })

  test('a refund shows the sign outside the dollar', () => {
    expect(formatMoney(-40)).toBe('-$40.00')
  })

  test('a date does not shift a day regardless of the runner timezone', () => {
    // The bug this guards: `new Date('2026-03-01')` is midnight UTC, which
    // renders as February 28 anywhere west of Greenwich.
    expect(formatDate('2026-03-01')).toBe('March 1, 2026')
    expect(formatDate('2026-01-01')).toBe('January 1, 2026')
  })

  test('an absent date renders as nothing rather than "Invalid Date"', () => {
    expect(formatDate(null)).toBe('')
  })
})

describe('statementHtml', () => {
  test('lists every selection with its figures', () => {
    const html = statementHtml({
      memberName: 'Jane Smith',
      reunionName: 'Smith Family Reunion',
      lines: [
        line(),
        line({ eventName: 'Picnic', amountOwed: 50, amountPaid: 50, outstanding: 0 }),
      ],
      totals: totals({ totalOwed: 250, totalPaid: 50, totalOutstanding: 200 }),
      payUrl: 'https://homekin.test/reunion/r1/signups',
    })

    expect(html).toContain('Hi Jane Smith,')
    expect(html).toContain('Banquet')
    expect(html).toContain('Picnic')
    expect(html).toContain('$250.00')
    expect(html).toContain('$200.00')
    expect(html).toContain('https://homekin.test/reunion/r1/signups')
  })

  test('escapes an event name that looks like markup', () => {
    const html = statementHtml({
      memberName: '<script>alert(1)</script>',
      reunionName: 'R & R Reunion',
      lines: [line({ eventName: '<img onerror=alert(1)>' })],
      totals: totals(),
      payUrl: 'https://homekin.test/x',
    })

    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img onerror')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('R &amp; R Reunion')
  })

  test('falls back to a bare greeting when the name is blank', () => {
    const html = statementHtml({
      memberName: '   ',
      reunionName: 'R',
      lines: [line()],
      totals: totals(),
      payUrl: 'https://homekin.test/x',
    })
    expect(html).toContain('Hi,')
  })

  test('leads with the overdue amount when something is late', () => {
    const html = statementHtml({
      memberName: 'Jane',
      reunionName: 'R',
      lines: [line()],
      totals: totals({ overdue: 75, dueNow: 75 }),
      payUrl: 'https://homekin.test/x',
    })
    expect(html).toContain('$75.00 is past its due date')
  })

  test('leads with what is due now when nothing is late yet', () => {
    const html = statementHtml({
      memberName: 'Jane',
      reunionName: 'R',
      lines: [line()],
      totals: totals({ dueNow: 50 }),
      payUrl: 'https://homekin.test/x',
    })
    expect(html).toContain('$50.00 is due now')
    expect(html).not.toContain('past its due date')
  })

  test('does not demand payment from someone who has paid in full', () => {
    const html = statementHtml({
      memberName: 'Jane',
      reunionName: 'R',
      lines: [line({ amountPaid: 200, outstanding: 0 })],
      totals: totals({ totalPaid: 200, totalOutstanding: 0 }),
      payUrl: 'https://homekin.test/x',
    })

    expect(html).toContain('all paid up')
    expect(html).toContain('View my signups')
    expect(html).not.toContain('Pay now')
  })

  test('shows a credit rather than a negative outstanding', () => {
    const html = statementHtml({
      memberName: 'Jane',
      reunionName: 'R',
      lines: [line({ amountPaid: 250, outstanding: 0, credit: 50 })],
      totals: totals({ totalPaid: 250, totalOutstanding: 0, totalCredit: 50 }),
      payUrl: 'https://homekin.test/x',
    })
    expect(html).toContain('$50.00 credit')
    expect(html).toContain('Credit')
  })

  test('renders the payment schedule for an event that has checkpoints', () => {
    const html = statementHtml({
      memberName: 'Jane',
      reunionName: 'R',
      lines: [
        line({
          instalments: [
            instalment({ label: 'Deposit', status: 'paid', applied: 100, shortfall: 0 }),
            instalment({
              deadlineId: 'd2',
              label: 'Final balance',
              dueDate: '2026-07-01',
              status: 'upcoming',
            }),
          ],
        }),
      ],
      totals: totals(),
      payUrl: 'https://homekin.test/x',
    })

    expect(html).toContain('payment schedule')
    expect(html).toContain('Deposit')
    expect(html).toContain('Final balance')
    expect(html).toContain('March 1, 2026')
    expect(html).toContain('July 1, 2026')
    expect(html).toContain('Paid')
  })

  test('omits the schedule when the event has no checkpoints of its own', () => {
    const html = statementHtml({
      memberName: 'Jane',
      reunionName: 'R',
      lines: [line({ instalments: [instalment({ deadlineId: null, label: 'Full amount' })] })],
      totals: totals(),
      payUrl: 'https://homekin.test/x',
    })
    expect(html).not.toContain('payment schedule')
  })

  test('shows how far short a partly-paid checkpoint is', () => {
    const html = statementHtml({
      memberName: 'Jane',
      reunionName: 'R',
      lines: [line({ instalments: [instalment({ applied: 30, shortfall: 70, status: 'overdue' })] })],
      totals: totals(),
      payUrl: 'https://homekin.test/x',
    })
    expect(html).toContain('$70.00 short')
    expect(html).toContain('Overdue')
  })

  test('a general-fund line with no headcount renders a dash', () => {
    const html = statementHtml({
      memberName: 'Jane',
      reunionName: 'R',
      lines: [line({ eventName: 'General Fund', eventDate: null, headcount: null })],
      totals: totals(),
      payUrl: 'https://homekin.test/x',
    })
    expect(html).toContain('General Fund')
    expect(html).toContain('—')
  })
})

describe('statementSubject', () => {
  test('names the outstanding amount', () => {
    expect(statementSubject('Smith Reunion', totals({ totalOutstanding: 200 }))).toBe(
      'Smith Reunion: your signups and $200.00 outstanding'
    )
  })

  test('leads with overdue when something is late', () => {
    expect(statementSubject('Smith Reunion', totals({ overdue: 50 }))).toContain('$50.00 overdue')
  })

  test('says paid in full when nothing is owed', () => {
    expect(statementSubject('Smith Reunion', totals({ totalOutstanding: 0 }))).toContain(
      'paid in full'
    )
  })
})

describe('reminderHtml', () => {
  function reminder(overrides: Partial<ReminderInput> = {}): ReminderInput {
    return {
      memberName: 'Jane',
      reunionName: 'Smith Reunion',
      eventName: 'Banquet',
      label: 'Deposit',
      dueDate: '2026-03-01',
      shortfall: 50,
      eventOutstanding: 200,
      daysUntilDue: 14,
      payUrl: 'https://homekin.test/pay',
      ...overrides,
    }
  }

  test('says what is due, when, and for which event', () => {
    const html = reminderHtml(reminder())
    expect(html).toContain('Deposit')
    expect(html).toContain('Banquet')
    expect(html).toContain('in 14 days')
    expect(html).toContain('March 1, 2026')
    expect(html).toContain('$50.00')
  })

  test('changes tense once the date has passed', () => {
    const html = reminderHtml(reminder({ daysUntilDue: -3 }))
    expect(html).toContain('overdue')
    expect(html).toContain('was due')
    expect(html).toContain('3 days ago')
  })

  test('reads naturally on the day and the day before', () => {
    expect(reminderHtml(reminder({ daysUntilDue: 0 }))).toContain('due today')
    expect(reminderHtml(reminder({ daysUntilDue: 1 }))).toContain('due tomorrow')
    expect(reminderHtml(reminder({ daysUntilDue: -1 }))).toContain('yesterday')
  })

  test('mentions the wider event total only when it is more than this checkpoint', () => {
    expect(reminderHtml(reminder())).toContain('Total still owed for this event')
    expect(reminderHtml(reminder({ eventOutstanding: 50 }))).not.toContain(
      'Total still owed for this event'
    )
  })

  test('escapes a checkpoint label typed by the committee', () => {
    const html = reminderHtml(reminder({ label: '<b>Deposit</b>' }))
    expect(html).not.toContain('<b>Deposit</b>')
    expect(html).toContain('&lt;b&gt;')
  })

  test('the subject distinguishes upcoming from overdue', () => {
    expect(reminderSubject(reminder())).toContain('due in 14 days')
    expect(reminderSubject(reminder({ daysUntilDue: -2 }))).toContain('was due 2 days ago')
  })
})

describe('receiptHtml', () => {
  function receipt(overrides: Partial<ReceiptInput> = {}): ReceiptInput {
    return {
      memberName: 'Jane',
      reunionName: 'Smith Reunion',
      eventName: 'Banquet',
      amount: 100,
      method: 'stripe',
      paidAt: '2026-03-01',
      remaining: 100,
      payUrl: 'https://homekin.test/pay',
      ...overrides,
    }
  }

  test('confirms the amount, method and what is left', () => {
    const html = receiptHtml(receipt())
    expect(html).toContain('$100.00')
    expect(html).toContain('Online payment')
    expect(html).toContain('March 1, 2026')
    expect(html).toContain('Still outstanding')
    expect(html).toContain('Pay the rest')
  })

  test('does not offer to take more money once the balance is settled', () => {
    const html = receiptHtml(receipt({ remaining: 0 }))
    expect(html).toContain('View my signups')
    expect(html).not.toContain('Pay the rest')
  })

  test('the subject names the amount received', () => {
    expect(receiptSubject(receipt())).toBe('Smith Reunion: $100.00 received')
  })

  test('names a manual method in words', () => {
    expect(receiptHtml(receipt({ method: 'cashapp' }))).toContain('Cash App')
    expect(receiptHtml(receipt({ method: 'check' }))).toContain('Check')
  })

  test('falls back to the raw method rather than blank for an unknown one', () => {
    expect(receiptHtml(receipt({ method: 'barter' }))).toContain('Barter')
  })

  test('names the wallet a member actually paid with', () => {
    // The whole point of capturing the method: 'Apple Pay' is what the member
    // will recognise on their statement, where 'Online payment' tells them
    // nothing they did not already know.
    const applePay = receiptHtml(receipt({ method: 'stripe', stripePaymentMethod: 'apple_pay' }))
    expect(applePay).toContain('Apple Pay')
    expect(applePay).not.toContain('Online payment')

    expect(receiptHtml(receipt({ method: 'stripe', stripePaymentMethod: 'cashapp' }))).toContain(
      'Cash App Pay'
    )
  })
})
