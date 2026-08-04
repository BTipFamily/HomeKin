// Finding the weekend that suits the most families.
//
// Months rank by counting. Ranges do not: "12–19 July" and "15–22 July" agree
// about a window neither of them names, and the committee needs that window.
// So the ranges are swept day by day and every candidate window of the wanted
// length is scored by how many households can cover all of it.
//
// Scored by households AND by people, because eight families of two is a
// different problem from two families of eight and a committee picking a date
// needs to see which it is looking at.
//
// Pure — this is the number a venue deposit gets paid against.

import { addDays, daysBetween } from '@/lib/payment-schedule'

export type AvailabilityRange = {
  /** Groups ranges belonging to one family, so a family is counted once. */
  responseId: string
  memberName: string
  people: number
  /** 'YYYY-MM-DD', inclusive. */
  starts_on: string
  ends_on: string
}

export type CandidateWindow = {
  starts_on: string
  ends_on: string
  /** Households that can cover the whole window. */
  households: number
  people: number
  who: string[]
}

/** Every date in a range, inclusive of both ends. */
function datesIn(range: { starts_on: string; ends_on: string }): string[] {
  const span = daysBetween(range.starts_on, range.ends_on)
  if (span < 0) return []
  const dates: string[] = []
  for (let i = 0; i <= span; i += 1) dates.push(addDays(range.starts_on, i))
  return dates
}

/**
 * The windows of `nights + 1` days that the most families can cover.
 *
 * A family counts only if it can cover the window *entirely* — someone free for
 * two days of a three-day reunion is not available for it, and counting them
 * would overstate the turnout that a deposit is based on. A family with two
 * separate ranges is still one family: whichever of its ranges covers the
 * window is enough, and it is never counted twice.
 *
 * Returns every window with at least one household, best first. Ties break by
 * people, then by date, so the ranking is stable and the earliest of two equal
 * options wins — which is the one that leaves more time to plan.
 */
export function bestWindows(
  ranges: AvailabilityRange[],
  nights = 2,
  limit = 5
): CandidateWindow[] {
  if (ranges.length === 0) return []
  const length = Math.max(nights, 0)

  // Every day any family named is a possible start.
  const starts = new Set<string>()
  for (const range of ranges) for (const date of datesIn(range)) starts.add(date)

  const byResponse = new Map<string, AvailabilityRange[]>()
  for (const range of ranges) {
    const list = byResponse.get(range.responseId) ?? []
    list.push(range)
    byResponse.set(range.responseId, list)
  }

  const windows: CandidateWindow[] = []

  for (const start of starts) {
    const end = addDays(start, length)

    let households = 0
    let people = 0
    const who: string[] = []

    for (const [, familyRanges] of byResponse) {
      // One range has to cover the whole window. Two adjacent ranges that
      // together span it are deliberately not combined: a family that said
      // "the 12th to the 14th" and "the 16th to the 18th" has told us the 15th
      // does not work, and stitching them would put the reunion on it.
      const covers = familyRanges.some(
        (range) =>
          daysBetween(range.starts_on, start) >= 0 && daysBetween(end, range.ends_on) >= 0
      )
      if (!covers) continue

      households += 1
      people += familyRanges[0].people
      who.push(familyRanges[0].memberName)
    }

    if (households > 0) {
      windows.push({ starts_on: start, ends_on: end, households, people, who: who.sort() })
    }
  }

  return windows
    .sort(
      (a, b) =>
        b.households - a.households ||
        b.people - a.people ||
        a.starts_on.localeCompare(b.starts_on)
    )
    .slice(0, limit)
}

/**
 * Who cannot make a window — the other half of the decision.
 *
 * A committee choosing between two nearly equal weekends is really choosing
 * who to leave out, and that is much easier to weigh with names than with a
 * count of the people who can come.
 */
export function whoIsMissing(
  ranges: AvailabilityRange[],
  window: { starts_on: string; ends_on: string }
): string[] {
  const byResponse = new Map<string, AvailabilityRange[]>()
  for (const range of ranges) {
    const list = byResponse.get(range.responseId) ?? []
    list.push(range)
    byResponse.set(range.responseId, list)
  }

  const missing: string[] = []
  for (const [, familyRanges] of byResponse) {
    const covers = familyRanges.some(
      (range) =>
        daysBetween(range.starts_on, window.starts_on) >= 0 &&
        daysBetween(window.ends_on, range.ends_on) >= 0
    )
    if (!covers) missing.push(familyRanges[0].memberName)
  }
  return missing.sort()
}

/**
 * Counts location suggestions, folding the ways people type the same place.
 *
 * "Atlanta", "atlanta " and "Atlanta," are one suggestion. Normalised only for
 * counting — the original text is what the committee sees, because "Atlanta,
 * GA" is more useful to read back than a lowercased key.
 */
export function rankSuggestions(
  suggestions: { text: string; people: number }[]
): { label: string; households: number; people: number }[] {
  const byKey = new Map<string, { label: string; households: number; people: number }>()

  for (const { text, people } of suggestions) {
    const label = text.trim().replace(/[.,;]+$/, '')
    if (!label) continue
    const key = label.toLowerCase()

    const existing = byKey.get(key)
    if (existing) {
      existing.households += 1
      existing.people += people
    } else {
      byKey.set(key, { label, households: 1, people })
    }
  }

  return [...byKey.values()].sort(
    (a, b) => b.households - a.households || b.people - a.people || a.label.localeCompare(b.label)
  )
}
