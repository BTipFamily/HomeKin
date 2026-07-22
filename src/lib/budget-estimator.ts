import type {
  BudgetCategory,
  BudgetCategoryKey,
  BudgetEstimateType,
  BudgetStyle,
  LodgingType,
} from '@/types/database'

// Cost-of-living multiplier per host city, relative to a national baseline of 1.0.
// Unlisted cities fall back to 1.0 via CITY_COST_INDEX[city] ?? 1.
export const CITY_COST_INDEX: Record<string, number> = {
  'Atlanta, GA': 1.0,
  'Austin, TX': 1.05,
  'Baltimore, MD': 1.1,
  'Boston, MA': 1.45,
  'Charlotte, NC': 0.95,
  'Chicago, IL': 1.2,
  'Cincinnati, OH': 0.9,
  'Cleveland, OH': 0.85,
  'Columbus, OH': 0.9,
  'Dallas, TX': 1.0,
  'Denver, CO': 1.1,
  'Detroit, MI': 0.85,
  'Houston, TX': 0.95,
  'Indianapolis, IN': 0.85,
  'Jacksonville, FL': 0.9,
  'Kansas City, MO': 0.85,
  'Las Vegas, NV': 1.05,
  'Los Angeles, CA': 1.5,
  'Memphis, TN': 0.8,
  'Miami, FL': 1.25,
  'Milwaukee, WI': 0.9,
  'Minneapolis, MN': 1.05,
  'Nashville, TN': 1.05,
  'New Orleans, LA': 1.0,
  'New York, NY': 1.6,
  'Orlando, FL': 1.0,
  'Philadelphia, PA': 1.15,
  'Phoenix, AZ': 1.0,
  'Pittsburgh, PA': 0.9,
  'Portland, OR': 1.15,
  'Raleigh, NC': 0.95,
  'Sacramento, CA': 1.2,
  'Salt Lake City, UT': 0.95,
  'San Antonio, TX': 0.9,
  'San Diego, CA': 1.4,
  'San Francisco, CA': 1.6,
  'Seattle, WA': 1.3,
  'St. Louis, MO': 0.85,
  'Tampa, FL': 0.95,
  'Washington, DC': 1.35,
}

export const DEFAULT_CITY_COST_INDEX = 1.0

export function getCityCostIndex(city: string | null | undefined): number {
  if (!city) return DEFAULT_CITY_COST_INDEX
  return CITY_COST_INDEX[city] ?? DEFAULT_CITY_COST_INDEX
}

export const BUDGET_STYLE_MULTIPLIER: Record<BudgetStyle, number> = {
  low: 0.7,
  average: 1.0,
  high: 1.4,
}

// Guests per room, by lodging type — drives room count for the "lodging" category.
export const OCCUPANCY_PER_ROOM: Record<LodgingType, number> = {
  hotel_resort: 4,
  vacation_rental: 6,
  mixed: 4,
}

export const CATEGORY_LABELS: Record<BudgetCategoryKey, string> = {
  venue: 'Venue',
  catering: 'Catering & Food',
  activities: 'Activities & Excursions',
  entertainment: 'Entertainment',
  heritage: 'Heritage & Genealogy',
  merchandise: 'Merchandise & Apparel',
  photography: 'Photography & Videography',
  lodging: 'Lodging',
}

export const CATEGORY_DESCRIPTIONS: Record<BudgetCategoryKey, string> = {
  venue: 'One-time estimate (edit amount below).',
  catering: 'Per adult/day estimate (youth/toddlers discounted automatically).',
  activities: 'Per person/day estimate.',
  entertainment: 'One-time estimate (edit amount below).',
  heritage: 'One-time estimate (edit amount below).',
  merchandise: 'Per person estimate (one-time).',
  photography: 'One-time estimate (edit amount below).',
  lodging: 'Lodging estimate based on rooms/units per night.',
}

export const HOST_CITIES = Object.keys(CITY_COST_INDEX).sort()

type CategoryDefault = {
  key: BudgetCategoryKey
  estimate_type: BudgetEstimateType
  baseUnitAmount: number
}

export const DEFAULT_CATEGORY_DEFS: CategoryDefault[] = [
  { key: 'venue', estimate_type: 'one_time', baseUnitAmount: 1200 },
  { key: 'catering', estimate_type: 'per_adult_day', baseUnitAmount: 45 },
  { key: 'activities', estimate_type: 'per_person_day', baseUnitAmount: 20 },
  { key: 'entertainment', estimate_type: 'one_time', baseUnitAmount: 800 },
  { key: 'heritage', estimate_type: 'one_time', baseUnitAmount: 250 },
  { key: 'merchandise', estimate_type: 'per_person', baseUnitAmount: 18 },
  { key: 'photography', estimate_type: 'one_time', baseUnitAmount: 1000 },
  { key: 'lodging', estimate_type: 'per_room_night', baseUnitAmount: 150 },
]

// Rounds to the nearest $5, matching the reference tool's whole-dollar suggested defaults.
function roundToNearest5(amount: number): number {
  return Math.round(amount / 5) * 5
}

export function getSuggestedRate(
  categoryKey: BudgetCategoryKey,
  city: string | null | undefined,
  style: BudgetStyle
): number {
  const def = DEFAULT_CATEGORY_DEFS.find((c) => c.key === categoryKey)
  if (!def) return 0
  const amount = def.baseUnitAmount * getCityCostIndex(city) * BUDGET_STYLE_MULTIPLIER[style]
  return roundToNearest5(amount)
}

export function buildDefaultCategories(
  city: string | null | undefined,
  style: BudgetStyle
): BudgetCategory[] {
  return DEFAULT_CATEGORY_DEFS.map((def) => ({
    key: def.key,
    label: CATEGORY_LABELS[def.key],
    enabled: true,
    estimate_type: def.estimate_type,
    unit_amount: getSuggestedRate(def.key, city, style),
  }))
}

export type GuestCounts = {
  adults: number
  youth: number
  toddlers: number
}

export function totalGuests(guests: GuestCounts): number {
  return guests.adults + guests.youth + guests.toddlers
}

// Youth are billed at half the adult catering rate, toddlers at a quarter —
// a reasonable default for "youth/toddlers discounted automatically".
const YOUTH_CATERING_FACTOR = 0.5
const TODDLER_CATERING_FACTOR = 0.25

export function computeCategorySubtotal(
  category: Pick<BudgetCategory, 'estimate_type' | 'unit_amount'>,
  guests: GuestCounts,
  nights: number,
  lodgingType: LodgingType = 'hotel_resort'
): number {
  const people = totalGuests(guests)
  switch (category.estimate_type) {
    case 'one_time':
      return category.unit_amount
    case 'per_person':
      return category.unit_amount * people
    case 'per_person_day':
      return category.unit_amount * people * nights
    case 'per_adult_day': {
      const billableAdults =
        guests.adults + guests.youth * YOUTH_CATERING_FACTOR + guests.toddlers * TODDLER_CATERING_FACTOR
      return category.unit_amount * billableAdults * nights
    }
    case 'per_room_night': {
      const occupancy = OCCUPANCY_PER_ROOM[lodgingType] ?? 4
      const rooms = people === 0 ? 0 : Math.ceil(people / occupancy)
      return category.unit_amount * rooms * nights
    }
    default:
      return 0
  }
}

export type BudgetTotals = {
  total: number
  perPerson: number
  categorySubtotals: Record<string, number>
}

export function computeTotal(
  categories: BudgetCategory[],
  guests: GuestCounts,
  nights: number,
  lodgingType: LodgingType = 'hotel_resort'
): BudgetTotals {
  const categorySubtotals: Record<string, number> = {}
  let total = 0
  for (const category of categories) {
    const subtotal = category.enabled
      ? computeCategorySubtotal(category, guests, nights, lodgingType)
      : 0
    categorySubtotals[category.key] = subtotal
    total += subtotal
  }
  const people = totalGuests(guests)
  return {
    total,
    perPerson: people === 0 ? 0 : total / people,
    categorySubtotals,
  }
}
