// What a member owes by each checkpoint, and when they are late.
//
// The invariant worth protecting: instalments always sum to exactly what is
// owed. Under-billing loses the committee real money and over-billing bills a
// family member twice, and both are silent.

import {
  addDays,
  buildSchedule,
  daysBetween,
  parseDeadlinesFromForm,
  parseReminderOffsets,
  remindersDueOn,
  rollupByDeadline,
  scheduleTotals,
  validateDeadlines,
  type Deadline,
} from '@/lib/payment-schedule'

function deadline(overrides: Partial<Deadline> & Pick<Deadline, 'id' | 'due_date'>): Deadline {
  return {
    label: 'Checkpoint',
    amount_type: 'percent',
    amount_value: 50,
    reminder_offsets: [14, 3],
    sort_order: 0,
    ...overrides,
  }
}

const sumDue = (instalments: { amountDue: number }[]) =>
  Math.round(instalments.reduce((total, i) => total + i.amountDue, 0) * 100) / 100

describe('date arithmetic', () => {
  test('adds and subtracts days across a month boundary', () => {
    expect(addDays('2026-03-01', -14)).toBe('2026-02-15')
    expect(addDays('2026-02-15', 14)).toBe('2026-03-01')
  })

  test('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })

  test('crosses a year end', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  test('daysBetween is negative for a date in the past', () => {
    expect(daysBetween('2026-03-01', '2026-03-15')).toBe(14)
    expect(daysBetween('2026-03-15', '2026-03-01')).toBe(-14)
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0)
  })
})

describe('buildSchedule', () => {
  test('an event with no checkpoints yields one instalment for the whole amount', () => {
    const schedule = buildSchedule({
      amountOwed: 200,
      amountPaid: 0,
      headcount: 2,
      deadlines: [],
      asOf: '2026-01-01',
      fallbackDueDate: '2026-08-01',
    })

    expect(schedule).toHaveLength(1)
    expect(schedule[0].amountDue).toBe(200)
    expect(schedule[0].dueDate).toBe('2026-08-01')
    expect(schedule[0].status).toBe('upcoming')
  })

  test('an undated instalment reads as due rather than upcoming', () => {
    const schedule = buildSchedule({
      amountOwed: 50,
      amountPaid: 0,
      headcount: 1,
      deadlines: [],
      asOf: '2026-01-01',
    })
    expect(schedule[0].dueDate).toBeNull()
    expect(schedule[0].status).toBe('due')
  })

  test('percent and remainder split the total exactly', () => {
    const schedule = buildSchedule({
      amountOwed: 400,
      amountPaid: 0,
      headcount: 2,
      deadlines: [
        deadline({ id: 'a', due_date: '2026-03-01', label: 'Deposit', amount_value: 25 }),
        deadline({
          id: 'b',
          due_date: '2026-07-01',
          label: 'Balance',
          amount_type: 'remainder',
          amount_value: null,
        }),
      ],
      asOf: '2026-01-01',
    })

    expect(schedule.map((i) => i.amountDue)).toEqual([100, 300])
    expect(schedule.map((i) => i.cumulativeRequired)).toEqual([100, 400])
    expect(sumDue(schedule)).toBe(400)
  })

  test('fixed_per_person multiplies by headcount', () => {
    const schedule = buildSchedule({
      amountOwed: 300,
      amountPaid: 0,
      headcount: 3,
      deadlines: [
        deadline({
          id: 'a',
          due_date: '2026-03-01',
          amount_type: 'fixed_per_person',
          amount_value: 25,
        }),
        deadline({
          id: 'b',
          due_date: '2026-07-01',
          amount_type: 'remainder',
          amount_value: null,
        }),
      ],
      asOf: '2026-01-01',
    })

    expect(schedule[0].amountDue).toBe(75)
    expect(schedule[1].amountDue).toBe(225)
  })

  test('checkpoints are ordered by due date, not by the order given', () => {
    const schedule = buildSchedule({
      amountOwed: 100,
      amountPaid: 0,
      headcount: 1,
      deadlines: [
        deadline({ id: 'late', due_date: '2026-07-01', label: 'Later', amount_value: 40 }),
        deadline({ id: 'early', due_date: '2026-03-01', label: 'Earlier', amount_value: 60 }),
      ],
      asOf: '2026-01-01',
    })

    expect(schedule.map((i) => i.label)).toEqual(['Earlier', 'Later'])
    expect(schedule.map((i) => i.amountDue)).toEqual([60, 40])
  })

  test('rounding drift lands on the last checkpoint so the total is exact', () => {
    // Three equal thirds of $100 is $33.33 each, which is a cent short.
    const schedule = buildSchedule({
      amountOwed: 100,
      amountPaid: 0,
      headcount: 1,
      deadlines: [
        deadline({ id: 'a', due_date: '2026-01-01', amount_value: 33.33 }),
        deadline({ id: 'b', due_date: '2026-02-01', amount_value: 33.33 }),
        deadline({ id: 'c', due_date: '2026-03-01', amount_value: 33.33 }),
      ],
      asOf: '2026-01-01',
    })

    expect(sumDue(schedule)).toBe(100)
    expect(schedule[2].amountDue).toBe(33.34)
  })

  test('what the checkpoints do not cover becomes a trailing instalment, not a bigger deposit', () => {
    // A lone "$25 per person" deposit on a $300 event schedules $50 of it. The
    // other $250 is still owed, but it is not owed on the deposit date — the
    // committee never said it was.
    const schedule = buildSchedule({
      amountOwed: 300,
      amountPaid: 0,
      headcount: 2,
      deadlines: [
        deadline({
          id: 'a',
          label: 'Deposit',
          due_date: '2026-03-01',
          amount_type: 'fixed_per_person',
          amount_value: 25,
        }),
      ],
      asOf: '2026-01-01',
      fallbackDueDate: '2026-08-01',
    })

    expect(schedule).toHaveLength(2)
    expect(schedule[0]).toMatchObject({ label: 'Deposit', amountDue: 50, deadlineId: 'a' })
    expect(schedule[1]).toMatchObject({
      label: 'Remaining balance',
      amountDue: 250,
      deadlineId: null,
      dueDate: '2026-08-01',
    })
    expect(sumDue(schedule)).toBe(300)
  })

  test('the trailing instalment is settled last, after every dated checkpoint', () => {
    const schedule = buildSchedule({
      amountOwed: 300,
      amountPaid: 60,
      headcount: 1,
      deadlines: [deadline({ id: 'a', due_date: '2026-03-01', amount_value: 10 })],
      asOf: '2026-01-01',
      fallbackDueDate: '2026-08-01',
    })

    expect(schedule[0]).toMatchObject({ amountDue: 30, applied: 30, shortfall: 0 })
    expect(schedule[1]).toMatchObject({ amountDue: 270, applied: 30, shortfall: 240 })
  })

  test('checkpoints asking for more than the total are capped, never over-billed', () => {
    const schedule = buildSchedule({
      amountOwed: 100,
      amountPaid: 0,
      headcount: 1,
      deadlines: [
        deadline({ id: 'a', due_date: '2026-01-01', amount_value: 80 }),
        deadline({ id: 'b', due_date: '2026-02-01', amount_value: 80 }),
      ],
      asOf: '2026-01-01',
    })

    expect(schedule.map((i) => i.amountDue)).toEqual([80, 20])
    expect(sumDue(schedule)).toBe(100)
  })

  test('a remainder with nothing left over is zero rather than negative', () => {
    const schedule = buildSchedule({
      amountOwed: 100,
      amountPaid: 0,
      headcount: 1,
      deadlines: [
        deadline({ id: 'a', due_date: '2026-01-01', amount_value: 100 }),
        deadline({
          id: 'b',
          due_date: '2026-02-01',
          amount_type: 'remainder',
          amount_value: null,
        }),
      ],
      asOf: '2026-01-01',
    })

    expect(schedule[1].amountDue).toBe(0)
    expect(schedule[1].status).toBe('paid')
  })

  test('an event costing nothing produces a settled schedule', () => {
    const schedule = buildSchedule({
      amountOwed: 0,
      amountPaid: 0,
      headcount: 1,
      deadlines: [deadline({ id: 'a', due_date: '2026-01-01', amount_value: 50 })],
      asOf: '2026-06-01',
    })

    expect(sumDue(schedule)).toBe(0)
    expect(schedule.every((i) => i.status === 'paid')).toBe(true)
  })
})

describe('applying payments', () => {
  const twoCheckpoints = [
    deadline({ id: 'a', due_date: '2026-03-01', label: 'Deposit', amount_value: 50 }),
    deadline({ id: 'b', due_date: '2026-07-01', label: 'Balance', amount_value: 50 }),
  ]

  test('a part payment settles the earliest checkpoint first', () => {
    const schedule = buildSchedule({
      amountOwed: 200,
      amountPaid: 100,
      headcount: 1,
      deadlines: twoCheckpoints,
      asOf: '2026-01-01',
    })

    expect(schedule[0].applied).toBe(100)
    expect(schedule[0].shortfall).toBe(0)
    expect(schedule[0].status).toBe('paid')
    expect(schedule[1].applied).toBe(0)
    expect(schedule[1].shortfall).toBe(100)
  })

  test('a payment smaller than the first checkpoint leaves it short', () => {
    const schedule = buildSchedule({
      amountOwed: 200,
      amountPaid: 30,
      headcount: 1,
      deadlines: twoCheckpoints,
      asOf: '2026-01-01',
    })

    expect(schedule[0].applied).toBe(30)
    expect(schedule[0].shortfall).toBe(70)
    expect(schedule[1].shortfall).toBe(100)
  })

  test('paying in full settles every checkpoint', () => {
    const schedule = buildSchedule({
      amountOwed: 200,
      amountPaid: 200,
      headcount: 1,
      deadlines: twoCheckpoints,
      asOf: '2026-12-01',
    })

    expect(schedule.every((i) => i.status === 'paid')).toBe(true)
  })

  test('an overpayment does not push a checkpoint negative', () => {
    const schedule = buildSchedule({
      amountOwed: 200,
      amountPaid: 500,
      headcount: 1,
      deadlines: twoCheckpoints,
      asOf: '2026-01-01',
    })

    expect(schedule.map((i) => i.applied)).toEqual([100, 100])
    expect(schedule.every((i) => i.shortfall === 0)).toBe(true)
  })
})

describe('instalment status', () => {
  const checkpoints = [
    deadline({ id: 'a', due_date: '2026-03-01', label: 'Deposit', amount_value: 50 }),
    deadline({ id: 'b', due_date: '2026-07-01', label: 'Balance', amount_value: 50 }),
  ]

  test('a missed checkpoint is overdue and the later one is still upcoming', () => {
    const schedule = buildSchedule({
      amountOwed: 200,
      amountPaid: 0,
      headcount: 1,
      deadlines: checkpoints,
      asOf: '2026-04-01',
    })

    expect(schedule.map((i) => i.status)).toEqual(['overdue', 'upcoming'])
  })

  test('a checkpoint falling today is due, not overdue', () => {
    const schedule = buildSchedule({
      amountOwed: 200,
      amountPaid: 0,
      headcount: 1,
      deadlines: checkpoints,
      asOf: '2026-03-01',
    })

    expect(schedule[0].status).toBe('due')
  })

  test('a settled checkpoint reads as paid even once its date has passed', () => {
    const schedule = buildSchedule({
      amountOwed: 200,
      amountPaid: 100,
      headcount: 1,
      deadlines: checkpoints,
      asOf: '2026-04-01',
    })

    expect(schedule.map((i) => i.status)).toEqual(['paid', 'upcoming'])
  })
})

describe('scheduleTotals', () => {
  test('separates what is late from what is merely outstanding', () => {
    const totals = scheduleTotals(
      buildSchedule({
        amountOwed: 300,
        amountPaid: 0,
        headcount: 1,
        deadlines: [
          deadline({ id: 'a', due_date: '2026-03-01', amount_value: 33.34 }),
          deadline({ id: 'b', due_date: '2026-05-01', amount_value: 33.33 }),
          deadline({ id: 'c', due_date: '2026-07-01', amount_value: 33.33 }),
        ],
        asOf: '2026-06-01',
      })
    )

    expect(totals.overdue).toBe(200.01)
    expect(totals.dueNow).toBe(200.01)
    expect(totals.outstanding).toBe(300)
    expect(totals.nextDueDate).toBe('2026-03-01')
  })

  test('the next due date skips checkpoints already settled', () => {
    const totals = scheduleTotals(
      buildSchedule({
        amountOwed: 200,
        amountPaid: 100,
        headcount: 1,
        deadlines: [
          deadline({ id: 'a', due_date: '2026-03-01', amount_value: 50 }),
          deadline({ id: 'b', due_date: '2026-07-01', amount_value: 50 }),
        ],
        asOf: '2026-04-01',
      })
    )

    expect(totals.nextDueDate).toBe('2026-07-01')
    expect(totals.nextDueAmount).toBe(100)
    expect(totals.overdue).toBe(0)
  })

  test('a fully paid schedule has no next date', () => {
    const totals = scheduleTotals(
      buildSchedule({
        amountOwed: 100,
        amountPaid: 100,
        headcount: 1,
        deadlines: [deadline({ id: 'a', due_date: '2026-03-01', amount_value: 100 })],
        asOf: '2026-04-01',
      })
    )

    expect(totals.nextDueDate).toBeNull()
    expect(totals.outstanding).toBe(0)
  })
})

describe('rollupByDeadline', () => {
  const checkpoints = [
    deadline({ id: 'a', due_date: '2026-03-01', label: 'Deposit', amount_value: 50 }),
    deadline({ id: 'b', due_date: '2026-07-01', label: 'Balance', amount_value: 50 }),
  ]

  const forMember = (owed: number, paid: number) =>
    buildSchedule({
      amountOwed: owed,
      amountPaid: paid,
      headcount: 1,
      deadlines: checkpoints,
      asOf: '2026-04-01',
    })

  test('totals each checkpoint across everyone and counts who is short', () => {
    const rollup = rollupByDeadline([...forMember(200, 100), ...forMember(200, 0)])

    expect(rollup).toHaveLength(2)
    expect(rollup[0]).toMatchObject({
      deadlineId: 'a',
      label: 'Deposit',
      dueDate: '2026-03-01',
      expected: 200,
      collected: 100,
      short: 100,
      membersPaid: 1,
      membersShort: 1,
    })
    expect(rollup[1]).toMatchObject({ deadlineId: 'b', collected: 0, membersShort: 2 })
  })

  test('orders by due date', () => {
    const rollup = rollupByDeadline(forMember(200, 0))
    expect(rollup.map((r) => r.dueDate)).toEqual(['2026-03-01', '2026-07-01'])
  })

  test('ignores instalments that are not real checkpoints', () => {
    const implicit = buildSchedule({
      amountOwed: 100,
      amountPaid: 0,
      headcount: 1,
      deadlines: [],
      asOf: '2026-04-01',
    })
    expect(rollupByDeadline(implicit)).toEqual([])
  })

  test('an empty list rolls up to nothing', () => {
    expect(rollupByDeadline([])).toEqual([])
  })
})

describe('remindersDueOn', () => {
  const checkpoint = deadline({ id: 'a', due_date: '2026-03-01', reminder_offsets: [14, 3] })

  test('fires a fortnight out', () => {
    expect(remindersDueOn(checkpoint, '2026-02-15')).toEqual([14])
  })

  test('fires again three days out', () => {
    expect(remindersDueOn(checkpoint, '2026-02-26')).toEqual([3])
  })

  test('stays silent on any other day', () => {
    expect(remindersDueOn(checkpoint, '2026-02-20')).toEqual([])
    expect(remindersDueOn(checkpoint, '2026-03-02')).toEqual([])
  })

  test('an offset of zero fires on the day itself', () => {
    expect(remindersDueOn({ ...checkpoint, reminder_offsets: [0] }, '2026-03-01')).toEqual([0])
  })

  test('an empty offset list never fires', () => {
    expect(remindersDueOn({ ...checkpoint, reminder_offsets: [] }, '2026-02-15')).toEqual([])
  })

  test('a duplicated offset still only fires once', () => {
    expect(remindersDueOn({ ...checkpoint, reminder_offsets: [14, 14] }, '2026-02-15')).toEqual([
      14,
    ])
  })
})

describe('validateDeadlines', () => {
  const valid = {
    id: null,
    label: 'Deposit',
    due_date: '2026-03-01',
    amount_type: 'percent' as const,
    amount_value: 25,
    reminder_offsets: [14],
  }

  test('accepts a sensible schedule', () => {
    expect(
      validateDeadlines(
        [valid, { ...valid, label: 'Balance', due_date: '2026-05-01', amount_value: 75 }],
        '2026-08-01'
      )
    ).toEqual([])
  })

  test('no deadlines at all is valid', () => {
    expect(validateDeadlines([], '2026-08-01')).toEqual([])
  })

  test('rejects percentages adding up past 100', () => {
    const errors = validateDeadlines(
      [valid, { ...valid, due_date: '2026-05-01', amount_value: 90 }],
      '2026-08-01'
    )
    expect(errors.some((e) => e.includes('115%'))).toBe(true)
  })

  test('rejects two deadlines on the same date', () => {
    const errors = validateDeadlines([valid, { ...valid, label: 'Other' }], '2026-08-01')
    expect(errors.some((e) => e.includes('2026-03-01'))).toBe(true)
  })

  test('rejects a deadline falling after the event', () => {
    const errors = validateDeadlines([{ ...valid, due_date: '2026-09-01' }], '2026-08-01')
    expect(errors.some((e) => e.includes('after the event'))).toBe(true)
  })

  test('rejects more than one remainder', () => {
    const remainder = {
      ...valid,
      amount_type: 'remainder' as const,
      amount_value: null,
    }
    const errors = validateDeadlines(
      [remainder, { ...remainder, due_date: '2026-05-01' }],
      '2026-08-01'
    )
    expect(errors.some((e) => e.includes('Only one deadline'))).toBe(true)
  })

  test('rejects a missing or zero amount', () => {
    expect(validateDeadlines([{ ...valid, amount_value: null }], null)).toHaveLength(1)
    expect(validateDeadlines([{ ...valid, amount_value: 0 }], null)).toHaveLength(1)
  })

  test('rejects a blank label and a negative reminder offset', () => {
    const errors = validateDeadlines(
      [{ ...valid, label: '  ', reminder_offsets: [-1] }],
      '2026-08-01'
    )
    expect(errors).toHaveLength(2)
  })
})

describe('parseReminderOffsets', () => {
  test('reads what a committee member would actually type', () => {
    expect(parseReminderOffsets('14, 3')).toEqual([14, 3])
    expect(parseReminderOffsets('14 3')).toEqual([14, 3])
    expect(parseReminderOffsets('3,14')).toEqual([14, 3])
  })

  test('drops junk rather than failing the whole save', () => {
    expect(parseReminderOffsets('14, abc, -2, 3.5, 3')).toEqual([14, 3])
  })

  test('deduplicates', () => {
    expect(parseReminderOffsets('14, 14, 3')).toEqual([14, 3])
  })

  test('an empty string means no reminders', () => {
    expect(parseReminderOffsets('')).toEqual([])
    expect(parseReminderOffsets('   ')).toEqual([])
  })
})

describe('parseDeadlinesFromForm', () => {
  function form(rows: Record<string, string>[]): FormData {
    const data = new FormData()
    for (const row of rows) {
      data.append('deadline_id', row.id ?? '')
      data.append('deadline_label', row.label ?? '')
      data.append('deadline_due_date', row.due_date ?? '')
      data.append('deadline_amount_type', row.amount_type ?? 'percent')
      data.append('deadline_amount_value', row.amount_value ?? '')
      data.append('deadline_reminder_offsets', row.reminder_offsets ?? '')
    }
    return data
  }

  test('zips the parallel arrays back into rows', () => {
    const parsed = parseDeadlinesFromForm(
      form([
        {
          id: 'existing-1',
          label: 'Deposit',
          due_date: '2026-03-01',
          amount_type: 'percent',
          amount_value: '25',
          reminder_offsets: '14, 3',
        },
        {
          label: 'Balance',
          due_date: '2026-07-01',
          amount_type: 'remainder',
          amount_value: '',
          reminder_offsets: '7',
        },
      ])
    )

    expect(parsed).toEqual([
      {
        id: 'existing-1',
        label: 'Deposit',
        due_date: '2026-03-01',
        amount_type: 'percent',
        amount_value: 25,
        reminder_offsets: [14, 3],
      },
      {
        id: null,
        label: 'Balance',
        due_date: '2026-07-01',
        amount_type: 'remainder',
        amount_value: null,
        reminder_offsets: [7],
      },
    ])
  })

  test('an empty form yields no deadlines', () => {
    expect(parseDeadlinesFromForm(new FormData())).toEqual([])
  })

  test('ignores a row left completely blank', () => {
    const parsed = parseDeadlinesFromForm(
      form([
        { label: 'Deposit', due_date: '2026-03-01', amount_value: '25' },
        { label: '', due_date: '' },
      ])
    )
    expect(parsed).toHaveLength(1)
  })

  test('drops an amount typed against a remainder row', () => {
    const parsed = parseDeadlinesFromForm(
      form([
        {
          label: 'Balance',
          due_date: '2026-07-01',
          amount_type: 'remainder',
          amount_value: '50',
        },
      ])
    )
    expect(parsed[0].amount_value).toBeNull()
  })

  test('falls back to percent for an amount type that was tampered with', () => {
    const parsed = parseDeadlinesFromForm(
      form([
        {
          label: 'Deposit',
          due_date: '2026-03-01',
          amount_type: 'drop table',
          amount_value: '25',
        },
      ])
    )
    expect(parsed[0].amount_type).toBe('percent')
  })

  test('a non-numeric amount becomes null rather than NaN', () => {
    const parsed = parseDeadlinesFromForm(
      form([{ label: 'Deposit', due_date: '2026-03-01', amount_value: 'lots' }])
    )
    expect(parsed[0].amount_value).toBeNull()
  })
})
