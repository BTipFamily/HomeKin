import {
  BUDGET_STYLE_MULTIPLIER,
  buildDefaultCategories,
  computeCategorySubtotal,
  computeTotal,
  getCityCostIndex,
  getSuggestedRate,
  totalGuests,
} from '@/lib/budget-estimator'

describe('City cost index', () => {
  test('known city returns its multiplier', () => {
    expect(getCityCostIndex('New York, NY')).toBe(1.6)
  })

  test('unknown city falls back to 1.0', () => {
    expect(getCityCostIndex('Nowhereville, XX')).toBe(1.0)
  })

  test('null/undefined city falls back to 1.0', () => {
    expect(getCityCostIndex(null)).toBe(1.0)
    expect(getCityCostIndex(undefined)).toBe(1.0)
  })
})

describe('Suggested rate prefill', () => {
  test('average style at a 1.0-index city returns the base rate', () => {
    expect(getSuggestedRate('venue', 'Atlanta, GA', 'average')).toBe(1200)
  })

  test('low style discounts the base rate', () => {
    expect(getSuggestedRate('venue', 'Atlanta, GA', 'low')).toBe(
      Math.round((1200 * BUDGET_STYLE_MULTIPLIER.low) / 5) * 5
    )
  })

  test('high style + expensive city compounds the multiplier', () => {
    const rate = getSuggestedRate('venue', 'New York, NY', 'high')
    expect(rate).toBeGreaterThan(1200)
  })
})

describe('buildDefaultCategories', () => {
  test('returns all 8 categories enabled by default', () => {
    const categories = buildDefaultCategories('Atlanta, GA', 'average')
    expect(categories).toHaveLength(8)
    expect(categories.every((c) => c.enabled)).toBe(true)
  })
})

describe('totalGuests', () => {
  test('sums adults, youth, and toddlers', () => {
    expect(totalGuests({ adults: 20, youth: 10, toddlers: 5 })).toBe(35)
  })
})

describe('computeCategorySubtotal', () => {
  const guests = { adults: 20, youth: 10, toddlers: 5 }

  test('one_time ignores guest count and nights', () => {
    const subtotal = computeCategorySubtotal(
      { estimate_type: 'one_time', unit_amount: 800 },
      guests,
      3
    )
    expect(subtotal).toBe(800)
  })

  test('per_person multiplies by total guests, ignores nights', () => {
    const subtotal = computeCategorySubtotal(
      { estimate_type: 'per_person', unit_amount: 18 },
      guests,
      3
    )
    expect(subtotal).toBe(18 * 35)
  })

  test('per_person_day multiplies by guests and nights', () => {
    const subtotal = computeCategorySubtotal(
      { estimate_type: 'per_person_day', unit_amount: 20 },
      guests,
      3
    )
    expect(subtotal).toBe(20 * 35 * 3)
  })

  test('per_adult_day discounts youth to 0.5x and toddlers to 0.25x', () => {
    const subtotal = computeCategorySubtotal(
      { estimate_type: 'per_adult_day', unit_amount: 45 },
      guests,
      3
    )
    // 20 + 10*0.5 + 5*0.25 = 26.25 billable adults
    expect(subtotal).toBe(45 * 26.25 * 3)
  })

  test('per_room_night rounds room count up and multiplies by nights', () => {
    // 35 guests / 4 per room = 8.75 -> 9 rooms
    const subtotal = computeCategorySubtotal(
      { estimate_type: 'per_room_night', unit_amount: 150 },
      guests,
      3,
      'hotel_resort'
    )
    expect(subtotal).toBe(150 * 9 * 3)
  })

  test('per_room_night with zero guests needs zero rooms', () => {
    const subtotal = computeCategorySubtotal(
      { estimate_type: 'per_room_night', unit_amount: 150 },
      { adults: 0, youth: 0, toddlers: 0 },
      3
    )
    expect(subtotal).toBe(0)
  })
})

describe('computeTotal', () => {
  const guests = { adults: 20, youth: 10, toddlers: 5 }

  test('disabled categories contribute nothing', () => {
    const categories = buildDefaultCategories('Atlanta, GA', 'average').map((c) =>
      c.key === 'photography' ? { ...c, enabled: false } : c
    )
    const totals = computeTotal(categories, guests, 3)
    expect(totals.categorySubtotals.photography).toBe(0)
  })

  test('total is the sum of enabled category subtotals', () => {
    const categories = buildDefaultCategories('Atlanta, GA', 'average')
    const totals = computeTotal(categories, guests, 3)
    const expected = Object.values(totals.categorySubtotals).reduce((a, b) => a + b, 0)
    expect(totals.total).toBe(expected)
    expect(totals.total).toBeGreaterThan(0)
  })

  test('per-person total divides by total guests', () => {
    const categories = buildDefaultCategories('Atlanta, GA', 'average')
    const totals = computeTotal(categories, guests, 3)
    expect(totals.perPerson).toBeCloseTo(totals.total / 35)
  })

  test('zero guests avoids divide-by-zero', () => {
    const categories = buildDefaultCategories('Atlanta, GA', 'average')
    const totals = computeTotal(categories, { adults: 0, youth: 0, toddlers: 0 }, 3)
    expect(totals.perPerson).toBe(0)
  })
})
