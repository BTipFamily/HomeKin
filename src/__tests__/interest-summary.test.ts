// Turning interest responses into planning numbers.
//
// The invariant worth protecting: a committee books a venue against these
// figures. Collapsing "probably" into "yes" produces a confident number that
// is wrong, and an over-confident headcount costs real money in a deposit for
// a room nobody fills.

import {
  monthDemand,
  projectHeadcount,
  summarizeInterest,
  topMonths,
  type InterestResponse,
} from '@/lib/interest-summary'

function response(overrides: Partial<InterestResponse> = {}): InterestResponse {
  return {
    member_id: 'm1',
    household_id: null,
    attending: 'yes',
    adults: 2,
    youth: 0,
    children: 0,
    preferred_months: [7],
    preferred_length: 'weekend',
    budget_band: '100_250',
    lodging_need: 'hotel',
    willing_to_volunteer: false,
    volunteer_areas: [],
    history_interest: false,
    ...overrides,
  }
}

describe('projectHeadcount', () => {
  it('reports a range, not a single number', () => {
    const projection = projectHeadcount([
      response({ attending: 'yes', adults: 2 }),
      response({ attending: 'probably', adults: 3 }),
      response({ attending: 'unsure', adults: 4 }),
      response({ attending: 'no', adults: 5 }),
    ])

    expect(projection.confirmed).toBe(2)
    expect(projection.likely).toBe(5)
    expect(projection.optimistic).toBe(9)
  })

  it('never counts a no', () => {
    const projection = projectHeadcount([response({ attending: 'no', adults: 9, children: 3 })])
    expect(projection.optimistic).toBe(0)
    expect(projection.adults).toBe(0)
    expect(projection.children).toBe(0)
  })

  it('breaks the party down by age, because catering and pricing differ', () => {
    const projection = projectHeadcount([
      response({ adults: 2, youth: 1, children: 3 }),
      response({ attending: 'probably', adults: 1, youth: 0, children: 1 }),
    ])

    expect(projection.adults).toBe(3)
    expect(projection.youth).toBe(1)
    expect(projection.children).toBe(4)
    expect(projection.confirmed).toBe(6)
  })

  it('has nothing to project from nothing', () => {
    expect(projectHeadcount([])).toEqual({
      confirmed: 0, likely: 0, optimistic: 0, adults: 0, youth: 0, children: 0,
    })
  })
})

describe('monthDemand', () => {
  it('counts households and people separately', () => {
    // Eight households of two is a different problem from two of eight.
    const demand = monthDemand([
      response({ preferred_months: [7], adults: 2 }),
      response({ preferred_months: [7], adults: 6 }),
      response({ preferred_months: [8], adults: 2 }),
    ])

    expect(demand[6]).toMatchObject({ month: 7, name: 'July', households: 2, people: 8 })
    expect(demand[7]).toMatchObject({ month: 8, households: 1, people: 2 })
  })

  it('always returns all twelve months so a heatmap has no gaps', () => {
    const demand = monthDemand([])
    expect(demand).toHaveLength(12)
    expect(demand[0].name).toBe('January')
    expect(demand.every((m) => m.households === 0)).toBe(true)
  })

  it('counts a month listed twice as one vote', () => {
    const demand = monthDemand([response({ preferred_months: [7, 7], adults: 2 })])
    expect(demand[6].households).toBe(1)
    expect(demand[6].people).toBe(2)
  })

  it('ignores the availability of someone who is not coming', () => {
    const demand = monthDemand([response({ attending: 'no', preferred_months: [7] })])
    expect(demand[6].households).toBe(0)
  })

  it('discards a month number that is not a month', () => {
    const demand = monthDemand([response({ preferred_months: [0, 13, 6] })])
    expect(demand[5].households).toBe(1)
    expect(demand.reduce((n, m) => n + m.households, 0)).toBe(1)
  })
})

describe('summarizeInterest', () => {
  it('counts every answer, including the no', () => {
    const summary = summarizeInterest([
      response({ attending: 'yes' }),
      response({ attending: 'no' }),
      response({ attending: 'probably' }),
    ])

    expect(summary.responded).toBe(3)
    expect(summary.attending).toEqual({ yes: 1, probably: 1, unsure: 0, no: 1 })
  })

  it('reports only the bands anyone chose', () => {
    const summary = summarizeInterest([
      response({ budget_band: 'under_100' }),
      response({ budget_band: 'under_100' }),
      response({ budget_band: '500_plus' }),
    ])

    expect(summary.budget).toEqual([
      { band: 'under_100', label: 'Under $100', households: 2 },
      { band: '500_plus', label: '$500+', households: 1 },
    ])
  })

  it('leaves an unanswered question out rather than guessing', () => {
    const summary = summarizeInterest([response({ budget_band: null, lodging_need: null })])
    expect(summary.budget).toEqual([])
    expect(summary.lodging).toEqual([])
  })

  it('builds the volunteer pool, busiest area first', () => {
    const summary = summarizeInterest([
      response({ willing_to_volunteer: true, volunteer_areas: ['food', 'setup'] }),
      response({ willing_to_volunteer: true, volunteer_areas: ['food'] }),
      response({ willing_to_volunteer: false, volunteer_areas: ['games'] }),
    ])

    expect(summary.volunteers.total).toBe(2)
    expect(summary.volunteers.byArea).toEqual([
      { area: 'food', count: 2 },
      { area: 'setup', count: 1 },
    ])
  })

  it('does not recruit someone who is not coming', () => {
    const summary = summarizeInterest([
      response({ attending: 'no', willing_to_volunteer: true, volunteer_areas: ['food'] }),
    ])
    expect(summary.volunteers.total).toBe(0)
    expect(summary.volunteers.byArea).toEqual([])
  })
})

describe('topMonths', () => {
  it('ranks by people, then households, then the calendar', () => {
    const summary = summarizeInterest([
      response({ preferred_months: [6], adults: 2 }),
      response({ preferred_months: [7], adults: 5 }),
      response({ preferred_months: [8], adults: 2 }),
    ])

    const top = topMonths(summary, 2)
    expect(top.map((m) => m.month)).toEqual([7, 6])
  })

  it('leaves out months nobody picked', () => {
    const summary = summarizeInterest([response({ preferred_months: [7] })])
    expect(topMonths(summary)).toHaveLength(1)
  })
})
