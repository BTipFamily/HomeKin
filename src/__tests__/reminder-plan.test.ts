// Who gets chased, and for how much.
//
// The two failures that matter are chasing someone who has already paid, and
// chasing the same person twice for one checkpoint. The first is decided here;
// the second is the unique index on email_sends, covered in
// supabase/tests/09_event_deadlines.sql.

import { planReminders, type DeadlineWithEvent } from '@/lib/reminder-plan'

const EVENT = 'event-1'

function deadline(overrides: Partial<DeadlineWithEvent> & { id: string }): DeadlineWithEvent {
  return {
    sub_event_id: EVENT,
    label: 'Deposit',
    due_date: '2026-03-01',
    amount_type: 'percent',
    amount_value: 50,
    reminder_offsets: [14, 3],
    sort_order: 0,
    ...overrides,
  }
}

function balance(memberId: string, owed: number, paid: number, subEventId = EVENT) {
  return { member_id: memberId, sub_event_id: subEventId, amount_owed: owed, amount_paid: paid }
}

describe('planReminders', () => {
  const deposit = deadline({ id: 'd1', label: 'Deposit', due_date: '2026-03-01' })
  const balanceDue = deadline({
    id: 'd2',
    label: 'Final balance',
    due_date: '2026-07-01',
    amount_type: 'remainder',
    amount_value: null,
  })

  test('chases an unpaid member a fortnight before the deposit', () => {
    const plan = planReminders({
      today: '2026-02-15',
      deadlines: [deposit, balanceDue],
      balances: [balance('m1', 200, 0)],
      signups: [{ member_id: 'm1', sub_event_id: EVENT, headcount: 2 }],
    })

    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({
      memberId: 'm1',
      deadlineId: 'd1',
      offsetDays: 14,
      label: 'Deposit',
      shortfall: 100,
      eventOutstanding: 200,
      daysUntilDue: 14,
    })
  })

  test('stays silent on a day no reminder falls', () => {
    expect(
      planReminders({
        today: '2026-02-20',
        deadlines: [deposit, balanceDue],
        balances: [balance('m1', 200, 0)],
        signups: [],
      })
    ).toEqual([])
  })

  test('never chases someone who has paid the event in full', () => {
    expect(
      planReminders({
        today: '2026-02-15',
        deadlines: [deposit, balanceDue],
        balances: [balance('m1', 200, 200)],
        signups: [],
      })
    ).toEqual([])
  })

  test('does not chase the deposit from someone who has already covered it', () => {
    // $100 paid on a $200 event settles the 50% deposit outright.
    const plan = planReminders({
      today: '2026-02-15',
      deadlines: [deposit, balanceDue],
      balances: [balance('m1', 200, 100)],
      signups: [],
    })
    expect(plan).toEqual([])
  })

  test('still chases the balance from someone who only paid the deposit', () => {
    const plan = planReminders({
      today: '2026-06-17', // 14 days before the July 1 balance
      deadlines: [deposit, balanceDue],
      balances: [balance('m1', 200, 100)],
      signups: [],
    })

    expect(plan).toHaveLength(1)
    expect(plan[0].deadlineId).toBe('d2')
    expect(plan[0].shortfall).toBe(100)
  })

  test('chases only the shortfall when a checkpoint is part paid', () => {
    const plan = planReminders({
      today: '2026-02-15',
      deadlines: [deposit, balanceDue],
      balances: [balance('m1', 200, 30)],
      signups: [],
    })

    expect(plan[0].shortfall).toBe(70)
    expect(plan[0].eventOutstanding).toBe(170)
  })

  test('uses headcount for a per-person checkpoint', () => {
    const perPerson = deadline({
      id: 'd3',
      amount_type: 'fixed_per_person',
      amount_value: 25,
      due_date: '2026-03-01',
    })

    const plan = planReminders({
      today: '2026-02-15',
      deadlines: [perPerson],
      balances: [balance('m1', 300, 0)],
      signups: [{ member_id: 'm1', sub_event_id: EVENT, headcount: 4 }],
    })

    expect(plan[0].shortfall).toBe(100)
  })

  test('assumes one person when there is a balance but no signup', () => {
    const perPerson = deadline({
      id: 'd3',
      amount_type: 'fixed_per_person',
      amount_value: 25,
      due_date: '2026-03-01',
    })

    const plan = planReminders({
      today: '2026-02-15',
      deadlines: [perPerson],
      balances: [balance('m1', 300, 0)],
      signups: [],
    })

    expect(plan[0].shortfall).toBe(25)
  })

  test('fires each offset in the series as its own reminder', () => {
    const both = planReminders({
      today: '2026-02-26', // 3 days out
      deadlines: [deposit],
      balances: [balance('m1', 200, 0)],
      signups: [],
    })

    expect(both).toHaveLength(1)
    expect(both[0].offsetDays).toBe(3)
    expect(both[0].daysUntilDue).toBe(3)
  })

  test('covers every member who is short, and nobody who is not', () => {
    const plan = planReminders({
      today: '2026-02-15',
      deadlines: [deposit],
      balances: [balance('m1', 200, 0), balance('m2', 200, 200), balance('m3', 100, 10)],
      signups: [],
    })

    expect(plan.map((c) => c.memberId).sort()).toEqual(['m1', 'm3'])
  })

  test('keeps events apart', () => {
    const other = deadline({ id: 'd9', sub_event_id: 'event-2', due_date: '2026-03-01' })

    const plan = planReminders({
      today: '2026-02-15',
      deadlines: [deposit, other],
      balances: [balance('m1', 200, 0), balance('m2', 80, 0, 'event-2')],
      signups: [],
    })

    expect(plan).toHaveLength(2)
    expect(plan.find((c) => c.memberId === 'm2')?.subEventId).toBe('event-2')
    expect(plan.find((c) => c.memberId === 'm2')?.shortfall).toBe(40)
  })

  test('ignores a general-fund balance, which belongs to no event', () => {
    const plan = planReminders({
      today: '2026-02-15',
      deadlines: [deposit],
      balances: [{ member_id: 'm1', sub_event_id: null, amount_owed: 500, amount_paid: 0 }],
      signups: [],
    })
    expect(plan).toEqual([])
  })

  test('a checkpoint with no reminders configured never fires', () => {
    const silent = deadline({ id: 'd4', reminder_offsets: [], due_date: '2026-03-01' })

    expect(
      planReminders({
        today: '2026-02-15',
        deadlines: [silent],
        balances: [balance('m1', 200, 0)],
        signups: [],
      })
    ).toEqual([])
  })

  test('orders the soonest deadlines first, so a capped run defers the least urgent', () => {
    const soon = deadline({ id: 'd5', due_date: '2026-03-01', reminder_offsets: [14] })
    const later = deadline({
      id: 'd6',
      sub_event_id: 'event-2',
      due_date: '2026-04-01',
      reminder_offsets: [45],
    })

    const plan = planReminders({
      today: '2026-02-15',
      deadlines: [later, soon],
      balances: [balance('m1', 200, 0), balance('m1', 200, 0, 'event-2')],
      signups: [],
    })

    expect(plan.map((c) => c.dueDate)).toEqual(['2026-03-01', '2026-04-01'])
  })
})
