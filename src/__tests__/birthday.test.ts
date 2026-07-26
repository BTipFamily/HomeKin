import {
  calculateAge,
  formatBirthday,
  formatBirthdayShort,
  parseBirthDate,
  parseDateInput,
} from '@/lib/birthday'

describe('parseDateInput', () => {
  test('accepts ISO dates', () => {
    expect(parseDateInput('1975-06-14')).toEqual({ iso: '1975-06-14' })
    expect(parseDateInput('  1975-6-4  ')).toEqual({ iso: '1975-06-04' })
    expect(parseDateInput('1975/06/14')).toEqual({ iso: '1975-06-14' })
  })

  test('accepts the US format Excel writes into CSV exports', () => {
    expect(parseDateInput('6/14/1975')).toEqual({ iso: '1975-06-14' })
    expect(parseDateInput('06/04/1975')).toEqual({ iso: '1975-06-04' })
    expect(parseDateInput('6-14-1975')).toEqual({ iso: '1975-06-14' })
  })

  test('rejects two-digit years rather than guessing a century', () => {
    const result = parseDateInput('6/14/75')
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toMatch(/two-digit year/)
  })

  test('rejects dates that do not exist', () => {
    expect(parseDateInput('1975-02-30')).toHaveProperty('error')
    expect(parseDateInput('1975-13-01')).toHaveProperty('error')
    expect(parseDateInput('2/30/1975')).toHaveProperty('error')
  })

  test('accepts a real leap day and rejects a fake one', () => {
    expect(parseDateInput('2000-02-29')).toEqual({ iso: '2000-02-29' })
    expect(parseDateInput('1900-02-29')).toHaveProperty('error')
  })

  test('rejects free text and empty input', () => {
    expect(parseDateInput('June 14th')).toHaveProperty('error')
    expect(parseDateInput('   ')).toHaveProperty('error')
  })
})

describe('parseBirthDate', () => {
  const today = new Date(2026, 6, 25) // 2026-07-25

  test('accepts a plausible birth date', () => {
    expect(parseBirthDate('1975-06-14', today)).toEqual({ iso: '1975-06-14' })
  })

  test('rejects a future date', () => {
    expect(parseBirthDate('2027-01-01', today)).toHaveProperty('error')
    expect(parseBirthDate('2026-07-26', today)).toHaveProperty('error')
  })

  test('accepts today', () => {
    expect(parseBirthDate('2026-07-25', today)).toEqual({ iso: '2026-07-25' })
  })

  test('rejects a year before 1900', () => {
    expect(parseBirthDate('1899-12-31', today)).toHaveProperty('error')
  })
})

describe('calculateAge', () => {
  const today = new Date(2026, 6, 25) // 2026-07-25

  test('counts whole years', () => {
    expect(calculateAge('1975-06-14', today)).toBe(51)
  })

  test('does not count a birthday that has not happened yet this year', () => {
    expect(calculateAge('1975-08-14', today)).toBe(50)
    expect(calculateAge('1975-07-26', today)).toBe(50)
  })

  test('counts the birthday itself', () => {
    expect(calculateAge('1975-07-25', today)).toBe(51)
  })

  test('returns 0 for an infant', () => {
    expect(calculateAge('2026-01-02', today)).toBe(0)
  })

  test('returns null for unparseable input', () => {
    expect(calculateAge('not a date', today)).toBeNull()
  })
})

describe('formatting', () => {
  test('renders the stored day, not the UTC-shifted one', () => {
    expect(formatBirthday('1975-06-14')).toBe('June 14, 1975')
    expect(formatBirthdayShort('1975-06-14')).toBe('June 14')
  })

  test('passes through anything it cannot parse', () => {
    expect(formatBirthday('')).toBe('')
  })
})
