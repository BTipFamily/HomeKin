// Group discount tiers.
//
// The invariant worth protecting: these numbers become what families are
// billed. A tier read wrong either overcharges a relative or undercharges the
// reunion, and because a tier change reprices everyone, an error propagates to
// every balance on the event at once.

import {
  amountOwedFor,
  effectivePricePerPerson,
  parseTiersFromForm,
  tierFor,
  tierStatus,
  validateTiers,
  type PriceTier,
} from '@/lib/event-pricing'

const TIERS: PriceTier[] = [
  { min_headcount: 10, price_per_person: 45 },
  { min_headcount: 25, price_per_person: 35 },
]
const BASE = 60

describe('tierFor', () => {
  it('applies the highest threshold that has been reached', () => {
    expect(tierFor(TIERS, 9)).toBeNull()
    expect(tierFor(TIERS, 10)?.price_per_person).toBe(45)
    expect(tierFor(TIERS, 24)?.price_per_person).toBe(45)
    expect(tierFor(TIERS, 25)?.price_per_person).toBe(35)
    expect(tierFor(TIERS, 500)?.price_per_person).toBe(35)
  })

  it('does not care what order the tiers arrive in', () => {
    const reversed = [...TIERS].reverse()
    expect(tierFor(reversed, 25)?.price_per_person).toBe(35)
  })
})

describe('effectivePricePerPerson', () => {
  it('charges the base price below the first threshold', () => {
    expect(effectivePricePerPerson(TIERS, 9, BASE)).toBe(60)
  })

  it('drops the moment the threshold is met', () => {
    expect(effectivePricePerPerson(TIERS, 10, BASE)).toBe(45)
  })

  it('prices an event with no tiers exactly as before', () => {
    expect(effectivePricePerPerson([], 100, BASE)).toBe(60)
  })

  it('never charges more than the standard price', () => {
    // validateTiers rejects this, but if one were ever saved, a bigger group
    // must not end up paying more than a smaller one.
    const bad: PriceTier[] = [{ min_headcount: 5, price_per_person: 99 }]
    expect(effectivePricePerPerson(bad, 10, BASE)).toBe(60)
  })
})

describe('amountOwedFor', () => {
  it('multiplies the effective price by that member’s own headcount', () => {
    expect(amountOwedFor(TIERS, 30, BASE, 4)).toBe(140)
  })

  it('rounds to the cent', () => {
    const tiers: PriceTier[] = [{ min_headcount: 2, price_per_person: 33.333 }]
    expect(amountOwedFor(tiers, 5, 100, 3)).toBe(100)
  })
})

describe('tierStatus', () => {
  it('says how many more people unlock the next discount', () => {
    const status = tierStatus(TIERS, 7, BASE)
    expect(status.pricePerPerson).toBe(60)
    expect(status.next?.min_headcount).toBe(10)
    expect(status.peopleToNext).toBe(3)
    expect(status.savingPerPersonAtNext).toBe(15)
  })

  it('moves on to the next threshold once one is reached', () => {
    const status = tierStatus(TIERS, 12, BASE)
    expect(status.current?.min_headcount).toBe(10)
    expect(status.next?.min_headcount).toBe(25)
    expect(status.peopleToNext).toBe(13)
    expect(status.savingPerPersonAtNext).toBe(10)
  })

  it('has nothing left to offer at the top tier', () => {
    const status = tierStatus(TIERS, 40, BASE)
    expect(status.next).toBeNull()
    expect(status.peopleToNext).toBeNull()
    expect(status.savingPerPersonAtNext).toBeNull()
  })

  it('reports the plain price when there are no tiers', () => {
    expect(tierStatus([], 4, BASE)).toMatchObject({
      pricePerPerson: 60, current: null, next: null, peopleToNext: null,
    })
  })
})

describe('validateTiers', () => {
  it('accepts a sensible ladder', () => {
    expect(validateTiers(TIERS, BASE)).toEqual([])
  })

  it('rejects two prices for the same group size', () => {
    const problems = validateTiers(
      [{ min_headcount: 10, price_per_person: 45 }, { min_headcount: 10, price_per_person: 40 }],
      BASE
    )
    expect(problems.join(' ')).toContain('two prices for 10')
  })

  it('rejects a group rate above the standard price', () => {
    const problems = validateTiers([{ min_headcount: 10, price_per_person: 75 }], BASE)
    expect(problems.join(' ')).toContain('should be a discount')
  })

  it('rejects a larger group paying more than a smaller one', () => {
    // Otherwise somebody's balance goes up when a cousin joins.
    const problems = validateTiers(
      [{ min_headcount: 10, price_per_person: 40 }, { min_headcount: 20, price_per_person: 50 }],
      BASE
    )
    expect(problems.join(' ')).toContain('should not pay more')
  })

  it('rejects nonsense sizes and prices', () => {
    expect(validateTiers([{ min_headcount: 0, price_per_person: 10 }], BASE).join(' ')).toContain(
      'at least 1 person'
    )
    expect(validateTiers([{ min_headcount: 5, price_per_person: -1 }], BASE).join(' ')).toContain(
      'cannot be negative'
    )
  })

  it('reports every problem at once rather than the first', () => {
    const problems = validateTiers(
      [{ min_headcount: 0, price_per_person: 10 }, { min_headcount: 3, price_per_person: 999 }],
      BASE
    )
    expect(problems.length).toBeGreaterThanOrEqual(2)
  })
})

describe('parseTiersFromForm', () => {
  function form(sizes: string[], prices: string[]): FormData {
    const data = new FormData()
    sizes.forEach((s) => data.append('tier_min_headcount', s))
    prices.forEach((p) => data.append('tier_price_per_person', p))
    return data
  }

  it('reads the repeating rows', () => {
    expect(parseTiersFromForm(form(['10', '25'], ['45', '35']))).toEqual([
      { min_headcount: 10, price_per_person: 45 },
      { min_headcount: 25, price_per_person: 35 },
    ])
  })

  it('skips the blank row at the bottom of the form', () => {
    expect(parseTiersFromForm(form(['10', ''], ['45', '']))).toHaveLength(1)
  })

  it('keeps a half-filled row so validation can complain about it', () => {
    // Dropping it silently would let a typo vanish instead of being reported.
    const tiers = parseTiersFromForm(form(['10'], ['']))
    expect(tiers).toHaveLength(1)
    expect(Number.isNaN(tiers[0].price_per_person)).toBe(true)
    expect(validateTiers(tiers, BASE).length).toBeGreaterThan(0)
  })
})
