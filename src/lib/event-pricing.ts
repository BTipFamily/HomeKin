// What an event costs a person, and how a group discount changes that.
//
// A tier says "at N people or more, the price is X". The event's own
// cost_per_person is the undiscounted rate, so tiers only ever reduce it and an
// event with no tiers prices exactly as it always has.
//
// Pure, so the tier selection — which decides what families are billed — can be
// tested without a database.

export type BookingMode = 'homekin' | 'direct' | 'group'

export type PriceTier = {
  min_headcount: number
  price_per_person: number
}

/** Where the discount stands right now, and what unlocks the next one. */
export type TierStatus = {
  pricePerPerson: number
  /** The tier currently in effect, or null when nobody has hit the first one. */
  current: PriceTier | null
  /** The next cheaper tier, if there is one. */
  next: PriceTier | null
  /**
   * How many more people unlock `next`. The number worth putting on the page —
   * "3 more and everyone pays $45" is what actually makes someone go and ask
   * their cousin.
   */
  peopleToNext: number | null
  savingPerPersonAtNext: number | null
}

/** Cheapest-threshold-first is meaningless; tiers are read in threshold order. */
function sorted(tiers: PriceTier[]): PriceTier[] {
  return [...tiers].sort((a, b) => a.min_headcount - b.min_headcount)
}

/**
 * The tier in effect at a given headcount: the highest threshold that has been
 * reached. Null below the first threshold, where the base price applies.
 */
export function tierFor(tiers: PriceTier[], totalHeadcount: number): PriceTier | null {
  let best: PriceTier | null = null
  for (const tier of sorted(tiers)) {
    if (totalHeadcount >= tier.min_headcount) best = tier
    else break
  }
  return best
}

/**
 * What each person pays at this headcount.
 *
 * Deliberately never returns more than `basePrice`: a tier priced above the
 * undiscounted rate is a data-entry mistake (validateTiers rejects it), and
 * charging more because more people came would be indefensible even if it
 * somehow got saved.
 */
export function effectivePricePerPerson(
  tiers: PriceTier[],
  totalHeadcount: number,
  basePrice: number
): number {
  const tier = tierFor(tiers, totalHeadcount)
  if (!tier) return basePrice
  return Math.min(tier.price_per_person, basePrice)
}

/** The next threshold not yet reached, or null once they all are. */
export function nextTier(tiers: PriceTier[], totalHeadcount: number): PriceTier | null {
  for (const tier of sorted(tiers)) {
    if (totalHeadcount < tier.min_headcount) return tier
  }
  return null
}

export function tierStatus(
  tiers: PriceTier[],
  totalHeadcount: number,
  basePrice: number
): TierStatus {
  const pricePerPerson = effectivePricePerPerson(tiers, totalHeadcount, basePrice)
  const current = tierFor(tiers, totalHeadcount)
  const next = nextTier(tiers, totalHeadcount)

  return {
    pricePerPerson,
    current,
    next,
    peopleToNext: next ? Math.max(next.min_headcount - totalHeadcount, 0) : null,
    savingPerPersonAtNext: next
      ? Math.max(round2(pricePerPerson - Math.min(next.price_per_person, basePrice)), 0)
      : null,
  }
}

/** Money, to the cent. Avoids 0.1 + 0.2 showing up on somebody's balance. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** What a member owes for an event at the current headcount. */
export function amountOwedFor(
  tiers: PriceTier[],
  totalHeadcount: number,
  basePrice: number,
  memberHeadcount: number
): number {
  return round2(effectivePricePerPerson(tiers, totalHeadcount, basePrice) * memberHeadcount)
}

/**
 * Why these tiers cannot be saved, in words a committee member can act on.
 *
 * Mirrors validateDeadlines in payment-schedule.ts: a list of human-readable
 * problems rather than a boolean, so the form can show all of them at once.
 */
export function validateTiers(tiers: PriceTier[], basePrice: number): string[] {
  const problems: string[] = []
  const seen = new Set<number>()

  for (const tier of tiers) {
    if (!Number.isFinite(tier.min_headcount) || tier.min_headcount < 1) {
      problems.push('A group size must be at least 1 person.')
      continue
    }
    if (seen.has(tier.min_headcount)) {
      problems.push(`There are two prices for ${tier.min_headcount} people — keep one.`)
    }
    seen.add(tier.min_headcount)

    if (!Number.isFinite(tier.price_per_person) || tier.price_per_person < 0) {
      problems.push(`The price at ${tier.min_headcount} people cannot be negative.`)
      continue
    }
    if (tier.price_per_person > basePrice) {
      problems.push(
        `The price at ${tier.min_headcount} people ($${tier.price_per_person.toFixed(2)}) is more ` +
          `than the standard price ($${basePrice.toFixed(2)}). A group rate should be a discount.`
      )
    }
  }

  // A bigger group paying more than a smaller one is almost always a typo, and
  // it would mean somebody's balance goes *up* when a cousin joins.
  const ordered = sorted(tiers)
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i].price_per_person > ordered[i - 1].price_per_person) {
      problems.push(
        `The price at ${ordered[i].min_headcount} people is higher than at ` +
          `${ordered[i - 1].min_headcount}. Larger groups should not pay more.`
      )
    }
  }

  return problems
}

/** Reads the repeating tier rows off the event form, like parseDeadlinesFromForm. */
export function parseTiersFromForm(formData: FormData): PriceTier[] {
  const sizes = formData.getAll('tier_min_headcount') as string[]
  const prices = formData.getAll('tier_price_per_person') as string[]

  const tiers: PriceTier[] = []
  for (let i = 0; i < sizes.length; i += 1) {
    const size = (sizes[i] ?? '').trim()
    const price = (prices[i] ?? '').trim()
    // A wholly blank row is the empty row at the bottom of the form, not input.
    if (size === '' && price === '') continue
    tiers.push({
      min_headcount: Number.parseInt(size, 10),
      price_per_person: Number.parseFloat(price),
    })
  }
  return tiers
}
