// Turning interest responses into the numbers a committee decides on.
//
// This is the reason interest_responses is a typed table rather than another
// generic survey: none of what follows is possible over free-text answers.
//
// The projection is the delicate part. "Are you coming?" answered eighteen
// months out is a guess, and treating a 'probably' as a 'yes' produces a
// confident number that is wrong — which is worse than an honest range,
// because a committee books a venue against it. So the headcount comes back
// as a range, with the certain floor and the optimistic ceiling both visible.
//
// Pure, so every one of these rules is testable without a database.

export type Attending = 'yes' | 'probably' | 'unsure' | 'no'
export type PreferredLength = 'one_day' | 'weekend' | 'long_weekend' | 'week'
export type BudgetBand = 'under_100' | '100_250' | '250_500' | '500_plus' | 'unsure'
export type LodgingNeed = 'hotel' | 'rental' | 'stay_with_family' | 'camping' | 'none' | 'unsure'

export type InterestResponse = {
  member_id: string
  household_id: string | null
  attending: Attending
  adults: number
  youth: number
  children: number
  preferred_months: number[]
  preferred_length: PreferredLength | null
  budget_band: BudgetBand | null
  lodging_need: LodgingNeed | null
  willing_to_volunteer: boolean
  volunteer_areas: string[]
  history_interest: boolean
  /** Free text. Read by people, never by the summary. */
  notes?: string | null
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const BUDGET_BAND_LABELS: Record<BudgetBand, string> = {
  under_100: 'Under $100',
  '100_250': '$100–250',
  '250_500': '$250–500',
  '500_plus': '$500+',
  unsure: 'Not sure yet',
}

export const LODGING_LABELS: Record<LodgingNeed, string> = {
  hotel: 'Hotel',
  rental: 'Rental / Airbnb',
  stay_with_family: 'Staying with family',
  camping: 'Camping',
  none: 'No lodging needed',
  unsure: 'Not sure yet',
}

export const LENGTH_LABELS: Record<PreferredLength, string> = {
  one_day: 'One day',
  weekend: 'A weekend',
  long_weekend: 'A long weekend',
  week: 'A week',
}

export type HeadcountProjection = {
  /** Everyone from households that said yes. What you can count on. */
  confirmed: number
  /** Confirmed plus the 'probably' households. The planning number. */
  likely: number
  /** Everything not an outright no. The ceiling, for capacity questions. */
  optimistic: number
  adults: number
  youth: number
  children: number
}

export type MonthDemand = { month: number; name: string; households: number; people: number }

export type InterestSummary = {
  responded: number
  attending: Record<Attending, number>
  headcount: HeadcountProjection
  months: MonthDemand[]
  budget: { band: BudgetBand; label: string; households: number }[]
  lodging: { need: LodgingNeed; label: string; households: number }[]
  lengths: { length: PreferredLength; label: string; households: number }[]
  volunteers: { total: number; byArea: { area: string; count: number }[] }
  historyInterest: number
}

function partySize(r: InterestResponse): number {
  return r.adults + r.youth + r.children
}

/** Everyone whose answer was not an outright no. */
function isPossible(r: InterestResponse): boolean {
  return r.attending !== 'no'
}

/**
 * Headcount as a range rather than a number.
 *
 * A committee books a venue against this, so the difference between "42 people
 * have said yes" and "42 people might come" has to survive into the answer.
 * Children are counted in the totals but reported separately, because catering
 * and pricing treat them differently and a single number hides that.
 */
export function projectHeadcount(responses: InterestResponse[]): HeadcountProjection {
  let confirmed = 0
  let likely = 0
  let optimistic = 0
  let adults = 0
  let youth = 0
  let children = 0

  for (const r of responses) {
    const size = partySize(r)
    if (r.attending === 'yes') {
      confirmed += size
      likely += size
      optimistic += size
    } else if (r.attending === 'probably') {
      likely += size
      optimistic += size
    } else if (r.attending === 'unsure') {
      optimistic += size
    }

    if (isPossible(r)) {
      adults += r.adults
      youth += r.youth
      children += r.children
    }
  }

  return { confirmed, likely, optimistic, adults, youth, children }
}

/**
 * Which months work, weighted by how many people each household brings.
 *
 * Counted both ways on purpose: eight households of two is a different problem
 * from two households of eight, and a committee picking a date needs to see
 * which it is looking at. Outright no's are excluded — their availability is
 * not information about when to hold the reunion.
 */
export function monthDemand(responses: InterestResponse[]): MonthDemand[] {
  const demand = MONTH_NAMES.map((name, i) => ({
    month: i + 1,
    name,
    households: 0,
    people: 0,
  }))

  for (const r of responses) {
    if (!isPossible(r)) continue
    // Deduplicated: a response listing the same month twice is one vote.
    for (const month of new Set(r.preferred_months)) {
      if (month < 1 || month > 12) continue
      demand[month - 1].households += 1
      demand[month - 1].people += partySize(r)
    }
  }

  return demand
}

function tally<T extends string>(
  responses: InterestResponse[],
  pick: (r: InterestResponse) => T | null,
  labels: Record<T, string>
): { key: T; label: string; households: number }[] {
  const counts = new Map<T, number>()
  for (const r of responses) {
    if (!isPossible(r)) continue
    const key = pick(r)
    if (key === null) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return (Object.keys(labels) as T[])
    .map((key) => ({ key, label: labels[key], households: counts.get(key) ?? 0 }))
    .filter((row) => row.households > 0)
}

/** Everything the committee dashboard needs, from one pass over the responses. */
export function summarizeInterest(responses: InterestResponse[]): InterestSummary {
  const attending: Record<Attending, number> = { yes: 0, probably: 0, unsure: 0, no: 0 }
  for (const r of responses) attending[r.attending] += 1

  const volunteerAreas = new Map<string, number>()
  let volunteers = 0
  let historyInterest = 0

  for (const r of responses) {
    if (!isPossible(r)) continue
    if (r.willing_to_volunteer) {
      volunteers += 1
      for (const area of new Set(r.volunteer_areas)) {
        volunteerAreas.set(area, (volunteerAreas.get(area) ?? 0) + 1)
      }
    }
    if (r.history_interest) historyInterest += 1
  }

  return {
    responded: responses.length,
    attending,
    headcount: projectHeadcount(responses),
    months: monthDemand(responses),
    budget: tally(responses, (r) => r.budget_band, BUDGET_BAND_LABELS).map((row) => ({
      band: row.key,
      label: row.label,
      households: row.households,
    })),
    lodging: tally(responses, (r) => r.lodging_need, LODGING_LABELS).map((row) => ({
      need: row.key,
      label: row.label,
      households: row.households,
    })),
    lengths: tally(responses, (r) => r.preferred_length, LENGTH_LABELS).map((row) => ({
      length: row.key,
      label: row.label,
      households: row.households,
    })),
    volunteers: {
      total: volunteers,
      byArea: [...volunteerAreas.entries()]
        .map(([area, count]) => ({ area, count }))
        .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area)),
    },
    historyInterest,
  }
}

/** The months with the most support, best first. Ties broken by calendar order. */
export function topMonths(summary: InterestSummary, limit = 3): MonthDemand[] {
  return [...summary.months]
    .filter((m) => m.households > 0)
    .sort((a, b) => b.people - a.people || b.households - a.households || a.month - b.month)
    .slice(0, limit)
}
