import { parseCsv } from '@/lib/csv'
import {
  buildMemberHistory,
  groupByReunion,
  summarizeHistory,
  toReportCsv,
  type HistoryBalance,
  type HistoryEvent,
  type HistoryPayment,
  type HistoryReunion,
  type HistorySignup,
} from '@/lib/member-history'

const reunions: HistoryReunion[] = [
  { id: 'r1', name: 'Smith Reunion', year: 2026 },
  { id: 'r0', name: 'Smith Reunion', year: 2024 },
]

const events: HistoryEvent[] = [
  { id: 'e1', reunion_id: 'r1', name: 'Picnic', date: '2026-08-01' },
  { id: 'e2', reunion_id: 'r1', name: 'Banquet', date: '2026-08-02' },
  { id: 'e3', reunion_id: 'r1', name: 'Free Tour', date: '2026-08-03' },
  { id: 'e0', reunion_id: 'r0', name: 'Old Picnic', date: '2024-08-01' },
]

function build(over: {
  signups?: HistorySignup[]
  balances?: HistoryBalance[]
  payments?: HistoryPayment[]
} = {}) {
  return buildMemberHistory({
    signups: over.signups ?? [],
    balances: over.balances ?? [],
    payments: over.payments ?? [],
    events,
    reunions,
  })
}

const paidPicnic: HistoryBalance = {
  id: 'b1',
  sub_event_id: 'e1',
  reunion_id: 'r1',
  amount_owed: 100,
  amount_paid: 100,
  status: 'paid',
}

describe('buildMemberHistory', () => {
  test('pairs a signup with its balance', () => {
    const entries = build({
      signups: [{ sub_event_id: 'e1', headcount: 2, status: 'confirmed', created_at: '2026-05-01T00:00:00Z' }],
      balances: [paidPicnic],
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      eventName: 'Picnic',
      headcount: 2,
      signupStatus: 'confirmed',
      amountOwed: 100,
      amountPaid: 100,
      outstanding: 0,
      balanceStatus: 'paid',
    })
  })

  test('keeps a free event with no balance', () => {
    const entries = build({
      signups: [{ sub_event_id: 'e3', headcount: 1, status: 'pending', created_at: '2026-05-01T00:00:00Z' }],
    })
    expect(entries[0]).toMatchObject({
      eventName: 'Free Tour',
      headcount: 1,
      amountOwed: 0,
      amountPaid: 0,
      balanceStatus: null,
    })
  })

  test('shows a general-fund balance that has no signup', () => {
    const entries = build({
      balances: [
        { id: 'b9', sub_event_id: null, reunion_id: 'r1', amount_owed: 25, amount_paid: 25, status: 'paid' },
      ],
    })
    expect(entries[0]).toMatchObject({
      eventName: 'General Fund',
      eventId: null,
      headcount: null,
      signupStatus: null,
      amountPaid: 25,
    })
  })

  test('keeps a balance whose signup was cancelled', () => {
    const entries = build({ balances: [paidPicnic] })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ eventName: 'Picnic', headcount: null, amountPaid: 100 })
  })

  test('does not double-count a balance that already has a signup', () => {
    const entries = build({
      signups: [{ sub_event_id: 'e1', headcount: 1, status: 'confirmed', created_at: '2026-05-01T00:00:00Z' }],
      balances: [paidPicnic],
    })
    expect(entries).toHaveLength(1)
  })

  test('computes outstanding and credit separately', () => {
    const entries = build({
      balances: [
        { id: 'b1', sub_event_id: 'e1', reunion_id: 'r1', amount_owed: 100, amount_paid: 40, status: 'partially_paid' },
        { id: 'b2', sub_event_id: 'e2', reunion_id: 'r1', amount_owed: 50, amount_paid: 75, status: 'paid' },
      ],
    })
    const picnic = entries.find((e) => e.eventName === 'Picnic')!
    const banquet = entries.find((e) => e.eventName === 'Banquet')!
    expect(picnic).toMatchObject({ outstanding: 60, credit: 0 })
    // An overpayment is a credit, never a negative amount outstanding.
    expect(banquet).toMatchObject({ outstanding: 0, credit: 25 })
  })

  test('attaches payments to the right entry, newest first', () => {
    const payments: HistoryPayment[] = [
      { id: 'p1', balance_id: 'b1', amount: 40, method: 'zelle', status: 'confirmed', paid_at: '2026-06-01T00:00:00Z', note: null },
      { id: 'p2', balance_id: 'b1', amount: 60, method: 'stripe', status: 'confirmed', paid_at: '2026-07-01T00:00:00Z', note: null },
      { id: 'p3', balance_id: 'bX', amount: 10, method: 'check', status: 'confirmed', paid_at: '2026-07-02T00:00:00Z', note: null },
    ]
    const entries = build({ balances: [paidPicnic], payments })
    expect(entries[0].payments.map((p) => p.id)).toEqual(['p2', 'p1'])
  })

  test('survives an event that has since been deleted', () => {
    const entries = build({
      signups: [{ sub_event_id: 'gone', headcount: 1, status: 'pending', created_at: '2026-05-01T00:00:00Z' }],
    })
    expect(entries[0].eventName).toBe('Removed event')
  })

  test('orders newest reunion first', () => {
    const entries = build({
      signups: [
        { sub_event_id: 'e0', headcount: 1, status: 'confirmed', created_at: '2024-05-01T00:00:00Z' },
        { sub_event_id: 'e1', headcount: 1, status: 'confirmed', created_at: '2026-05-01T00:00:00Z' },
      ],
    })
    expect(entries.map((e) => e.reunionYear)).toEqual([2026, 2024])
  })

  test('returns nothing for a member with no history', () => {
    expect(build()).toEqual([])
  })
})

describe('summarizeHistory', () => {
  test('totals money and headcount, counting only real events', () => {
    const entries = build({
      signups: [
        { sub_event_id: 'e1', headcount: 2, status: 'confirmed', created_at: '2026-05-01T00:00:00Z' },
        { sub_event_id: 'e2', headcount: 3, status: 'pending', created_at: '2026-05-01T00:00:00Z' },
      ],
      balances: [
        { id: 'b1', sub_event_id: 'e1', reunion_id: 'r1', amount_owed: 100, amount_paid: 100, status: 'paid' },
        { id: 'b2', sub_event_id: 'e2', reunion_id: 'r1', amount_owed: 150, amount_paid: 50, status: 'partially_paid' },
        { id: 'b3', sub_event_id: null, reunion_id: 'r1', amount_owed: 20, amount_paid: 20, status: 'paid' },
      ],
    })
    expect(summarizeHistory(entries)).toEqual({
      events: 2,
      totalHeadcount: 5,
      totalOwed: 270,
      totalPaid: 170,
      totalOutstanding: 100,
      totalCredit: 0,
    })
  })

  test('an empty history totals to zero', () => {
    expect(summarizeHistory([])).toMatchObject({ events: 0, totalOwed: 0, totalPaid: 0 })
  })
})

describe('groupByReunion', () => {
  test('groups entries and orders newest first', () => {
    const groups = groupByReunion(
      build({
        signups: [
          { sub_event_id: 'e0', headcount: 1, status: 'confirmed', created_at: '2024-05-01T00:00:00Z' },
          { sub_event_id: 'e1', headcount: 1, status: 'confirmed', created_at: '2026-05-01T00:00:00Z' },
          { sub_event_id: 'e2', headcount: 1, status: 'confirmed', created_at: '2026-05-01T00:00:00Z' },
        ],
      })
    )
    expect(groups.map((g) => g.reunionYear)).toEqual([2026, 2024])
    expect(groups[0].entries).toHaveLength(2)
  })
})

describe('toReportCsv', () => {
  const rows = build({
    signups: [{ sub_event_id: 'e1', headcount: 2, status: 'confirmed', created_at: '2026-05-01T00:00:00Z' }],
    balances: [
      { id: 'b1', sub_event_id: 'e1', reunion_id: 'r1', amount_owed: 100, amount_paid: 40, status: 'partially_paid' },
    ],
    payments: [
      { id: 'p1', balance_id: 'b1', amount: 40, method: 'zelle', status: 'confirmed', paid_at: '2026-06-01T00:00:00Z', note: null },
    ],
  }).map((e) => ({ ...e, memberId: 'm1', memberName: 'Jane Smith', memberEmail: 'jane@example.com', dueNow: 0, overdue: 0, nextDueDate: null }))

  test('round-trips through the CSV parser', () => {
    const grid = parseCsv(toReportCsv(rows))
    expect(grid[0]).toContain('member')
    expect(grid[1][0]).toBe('Jane Smith')
    expect(grid[1][grid[0].indexOf('outstanding')]).toBe('60.00')
  })

  test('summarizes payments in one cell', () => {
    const grid = parseCsv(toReportCsv(rows))
    expect(grid[1][grid[0].indexOf('payments')]).toBe('2026-06-01 $40.00 zelle')
  })

  test('marks a pending payment and formats a refund', () => {
    const withRefund = build({
      balances: [{ id: 'b1', sub_event_id: 'e1', reunion_id: 'r1', amount_owed: 100, amount_paid: 40, status: 'partially_paid' }],
      payments: [
        { id: 'p1', balance_id: 'b1', amount: -10, method: 'stripe', status: 'confirmed', paid_at: '2026-06-02T00:00:00Z', note: null },
        { id: 'p2', balance_id: 'b1', amount: 50, method: 'check', status: 'pending', paid_at: '2026-06-01T00:00:00Z', note: null },
      ],
    }).map((e) => ({
      ...e,
      memberId: 'm1',
      memberName: 'Jane',
      memberEmail: 'j@x.com',
      dueNow: 0,
      overdue: 0,
      nextDueDate: null,
    }))

    const grid = parseCsv(toReportCsv(withRefund))
    const cell = grid[1][grid[0].indexOf('payments')]
    expect(cell).toContain('-$10.00 stripe')
    expect(cell).toContain('$50.00 check (pending)')
  })

  test('quotes a member name containing a comma', () => {
    const grid = parseCsv(toReportCsv(rows.map((r) => ({ ...r, memberName: 'Smith, Jane' }))))
    expect(grid[1][0]).toBe('Smith, Jane')
  })

  test('an empty report still has a header row', () => {
    expect(parseCsv(toReportCsv([]))[0]).toContain('member')
  })
})
