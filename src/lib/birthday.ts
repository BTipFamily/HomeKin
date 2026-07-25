// Parsing, validating and displaying member birth dates.
//
// Dates arrive from three places with three different shapes: an <input
// type="date"> (always ISO), an .xlsx cell (ISO, courtesy of the reader in
// xlsx.ts), and a CSV saved out of Excel or Google Sheets (very often
// M/D/YYYY). parseDateInput accepts all of them and always hands back ISO.

/** Nobody in the directory predates this; anything earlier is a typo. */
export const MIN_BIRTH_YEAR = 1900

export type DateParseResult = { iso: string } | { error: string }

const ISO_RE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/
const US_RE = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function toIso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Parses a user- or spreadsheet-supplied date into ISO `YYYY-MM-DD`.
 *
 * Two-digit years are rejected rather than guessed: for a birth date, picking
 * the wrong century is worse than asking the user to be explicit.
 */
export function parseDateInput(value: string): DateParseResult {
  const trimmed = value.trim()
  if (!trimmed) return { error: 'is empty.' }

  const iso = trimmed.match(ISO_RE)
  if (iso) {
    const [, y, m, d] = iso.map(Number)
    if (!isRealDate(y, m, d)) return { error: `"${trimmed}" is not a real calendar date.` }
    return { iso: toIso(y, m, d) }
  }

  const us = trimmed.match(US_RE)
  if (us) {
    const [month, day, year] = [Number(us[1]), Number(us[2]), Number(us[3])]
    if (us[3].length < 4) {
      return {
        error: `"${trimmed}" uses a two-digit year — please write it in full (for example 1975-06-14 or 6/14/1975).`,
      }
    }
    if (!isRealDate(year, month, day)) {
      return { error: `"${trimmed}" is not a real calendar date.` }
    }
    return { iso: toIso(year, month, day) }
  }

  return {
    error: `"${trimmed}" is not a date we recognize — please use YYYY-MM-DD (for example 1975-06-14).`,
  }
}

/** Parses a date and additionally checks it is a plausible birth date. */
export function parseBirthDate(value: string, today = new Date()): DateParseResult {
  const parsed = parseDateInput(value)
  if ('error' in parsed) return parsed

  const year = Number(parsed.iso.slice(0, 4))
  if (year < MIN_BIRTH_YEAR) {
    return { error: `"${value.trim()}" is before ${MIN_BIRTH_YEAR} — please check the year.` }
  }
  if (parsed.iso > toIsoLocal(today)) {
    return { error: `"${value.trim()}" is in the future.` }
  }
  return parsed
}

/** Today's date in the server's local zone, as ISO. */
function toIsoLocal(date: Date): string {
  return toIso(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** Whole years between a birth date and today, or null if unparseable. */
export function calculateAge(iso: string, today = new Date()): number | null {
  const match = iso.match(ISO_RE)
  if (!match) return null
  const [, birthYear, birthMonth, birthDay] = match.map(Number)

  let age = today.getFullYear() - birthYear
  const monthDiff = today.getMonth() + 1 - birthMonth
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDay)) age--
  return age < 0 ? null : age
}

/**
 * "June 14, 1975". Built from the date parts rather than `new Date(iso)`,
 * which would be parsed as UTC midnight and render as the previous day for
 * anyone west of Greenwich.
 */
export function formatBirthday(iso: string): string {
  const match = iso.match(ISO_RE)
  if (!match) return iso
  const [, year, month, day] = match.map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** "June 14" — the year-free form used on directory cards. */
export function formatBirthdayShort(iso: string): string {
  const match = iso.match(ISO_RE)
  if (!match) return iso
  const [, year, month, day] = match.map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  })
}
