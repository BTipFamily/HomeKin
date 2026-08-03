// Start and end dates for a reunion.
//
// The invariant worth protecting: a reunion the wizard calls multi-day must
// actually carry an end date. Without one it is stored as, and behaves as, a
// single-day reunion — the exact confusion making multi-day the default was
// supposed to remove.

import {
  DEFAULT_REUNION_SPAN_DAYS,
  suggestEndDate,
  validateReunionDates,
} from '@/lib/reunion-dates'

describe('suggestEndDate', () => {
  it('offers the Friday-to-Sunday shape most reunions take', () => {
    expect(suggestEndDate('2027-07-16')).toBe('2027-07-18')
    expect(DEFAULT_REUNION_SPAN_DAYS).toBe(2)
  })

  it('crosses a month and a year without drifting', () => {
    expect(suggestEndDate('2027-07-30')).toBe('2027-08-01')
    expect(suggestEndDate('2027-12-31')).toBe('2028-01-02')
  })

  it('handles a leap day', () => {
    expect(suggestEndDate('2028-02-28')).toBe('2028-03-01')
  })

  it('has nothing to suggest without a start date', () => {
    expect(suggestEndDate('')).toBeNull()
  })
})

describe('validateReunionDates', () => {
  const multiDay = (startDate: string, endDate: string | null) =>
    validateReunionDates({ startDate, endDate, multiDay: true })

  it('accepts a normal multi-day span', () => {
    expect(multiDay('2027-07-16', '2027-07-18')).toBeNull()
  })

  it('accepts a single-day reunion with no end date', () => {
    expect(validateReunionDates({ startDate: '2027-07-16', endDate: null, multiDay: false }))
      .toBeNull()
  })

  it('refuses a multi-day reunion with no end date', () => {
    // The case the flipped default would otherwise create silently.
    expect(multiDay('2027-07-16', null)).toContain('end date')
  })

  it('refuses an end date before the start', () => {
    expect(multiDay('2027-07-18', '2027-07-16')).toContain('before the start')
  })

  it('refuses a multi-day reunion that starts and ends the same day', () => {
    // Not multi-day at all — point the organiser at the checkbox rather than
    // storing a span of zero.
    expect(multiDay('2027-07-16', '2027-07-16')).toContain('single-day')
  })

  it('asks for a start date first', () => {
    expect(validateReunionDates({ startDate: '', endDate: null, multiDay: true }))
      .toContain('start date')
    expect(validateReunionDates({ startDate: '', endDate: null, multiDay: false }))
      .toContain('start date')
  })

  it('ignores a stale end date once single-day is chosen', () => {
    // The checkbox clears it, but nothing should depend on that having happened.
    expect(validateReunionDates({
      startDate: '2027-07-16',
      endDate: '2027-07-10',
      multiDay: false,
    })).toBeNull()
  })
})
