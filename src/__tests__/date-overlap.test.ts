// Finding the weekend that suits the most families.
//
// The invariant worth protecting: a committee pays a venue deposit against
// these numbers. Counting a family as available for a window they cannot cover
// overstates the turnout, and the error is only discovered when the room is
// half empty.

import { bestWindows, rankSuggestions, whoIsMissing, type AvailabilityRange } from '@/lib/date-overlap'

function range(
  responseId: string,
  starts_on: string,
  ends_on: string,
  people = 2,
  memberName = responseId
): AvailabilityRange {
  return { responseId, memberName, people, starts_on, ends_on }
}

describe('bestWindows', () => {
  it('finds the window two ranges agree on but neither names', () => {
    const windows = bestWindows(
      [range('a', '2028-07-12', '2028-07-19'), range('b', '2028-07-15', '2028-07-22')],
      2
    )

    const shared = windows.find((w) => w.households === 2)
    expect(shared).toBeDefined()
    // The overlap is 15–19, so a three-day window must start within it.
    expect(shared!.starts_on >= '2028-07-15').toBe(true)
    expect(shared!.ends_on <= '2028-07-19').toBe(true)
  })

  it('does not count a family who can only cover part of the window', () => {
    // Free for two days of a three-day reunion is not available for it.
    const windows = bestWindows([range('a', '2028-07-12', '2028-07-13')], 2)
    expect(windows).toEqual([])
  })

  it('counts a family once however many ranges they gave', () => {
    const windows = bestWindows(
      [range('a', '2028-07-12', '2028-07-20'), range('a', '2028-08-01', '2028-08-09')],
      2
    )
    expect(windows.every((w) => w.households === 1)).toBe(true)
  })

  it('refuses to stitch two ranges across the gap between them', () => {
    // Saying "the 12th to the 14th" and "the 16th to the 18th" is saying the
    // 15th does not work. Combining them would put the reunion on it.
    const windows = bestWindows(
      [range('a', '2028-07-12', '2028-07-14'), range('a', '2028-07-16', '2028-07-18')],
      4
    )
    expect(windows).toEqual([])
  })

  it('ranks by households, then people, then the earlier date', () => {
    const windows = bestWindows(
      [
        range('a', '2028-07-01', '2028-07-10', 2),
        range('b', '2028-07-01', '2028-07-10', 2),
        range('c', '2028-08-01', '2028-08-10', 9),
      ],
      2
    )

    expect(windows[0].households).toBe(2)
    expect(windows[0].starts_on.startsWith('2028-07')).toBe(true)
  })

  it('handles a single-day reunion', () => {
    const windows = bestWindows([range('a', '2028-07-12', '2028-07-12')], 0)
    expect(windows[0]).toMatchObject({ starts_on: '2028-07-12', ends_on: '2028-07-12', households: 1 })
  })

  it('crosses a month and a year boundary without drifting', () => {
    const windows = bestWindows([range('a', '2028-12-30', '2029-01-03')], 2)
    expect(windows.some((w) => w.starts_on === '2028-12-30' && w.ends_on === '2029-01-01')).toBe(true)
  })

  it('finds nothing when nobody overlaps and everyone is too short', () => {
    const windows = bestWindows(
      [range('a', '2028-07-01', '2028-07-01'), range('b', '2028-09-01', '2028-09-01')],
      2
    )
    expect(windows).toEqual([])
  })

  it('has nothing to rank from nothing', () => {
    expect(bestWindows([], 2)).toEqual([])
  })

  it('names who can make each window', () => {
    const windows = bestWindows(
      [
        range('a', '2028-07-01', '2028-07-10', 2, 'Zora'),
        range('b', '2028-07-01', '2028-07-10', 3, 'Ada'),
      ],
      2
    )
    expect(windows[0].who).toEqual(['Ada', 'Zora'])
    expect(windows[0].people).toBe(5)
  })
})

describe('whoIsMissing', () => {
  it('names the families a window leaves out', () => {
    // Choosing between two near-equal weekends is choosing who to leave out.
    const ranges = [
      range('a', '2028-07-01', '2028-07-10', 2, 'Ada'),
      range('b', '2028-08-01', '2028-08-10', 2, 'Bo'),
    ]
    expect(whoIsMissing(ranges, { starts_on: '2028-07-02', ends_on: '2028-07-04' })).toEqual(['Bo'])
  })

  it('leaves nobody out when everyone can come', () => {
    const ranges = [range('a', '2028-07-01', '2028-07-10', 2, 'Ada')]
    expect(whoIsMissing(ranges, { starts_on: '2028-07-02', ends_on: '2028-07-04' })).toEqual([])
  })
})

describe('rankSuggestions', () => {
  it('folds the ways people type the same place', () => {
    const ranked = rankSuggestions([
      { text: 'Atlanta', people: 2 },
      { text: 'atlanta ', people: 3 },
      { text: 'Atlanta,', people: 1 },
      { text: 'Charleston', people: 4 },
    ])

    expect(ranked[0]).toEqual({ label: 'Atlanta', households: 3, people: 6 })
    expect(ranked[1].label).toBe('Charleston')
  })

  it('shows the text as typed, not the normalised key', () => {
    // "Atlanta, GA" reads back better than an lowercased key.
    const ranked = rankSuggestions([{ text: 'Atlanta, GA', people: 2 }])
    expect(ranked[0].label).toBe('Atlanta, GA')
  })

  it('ignores blank suggestions', () => {
    expect(rankSuggestions([{ text: '   ', people: 2 }])).toEqual([])
  })

  it('ranks by households, then people, then name', () => {
    const ranked = rankSuggestions([
      { text: 'Bravo', people: 1 },
      { text: 'Alpha', people: 1 },
    ])
    expect(ranked.map((r) => r.label)).toEqual(['Alpha', 'Bravo'])
  })
})
