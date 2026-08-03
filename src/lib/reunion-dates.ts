// Start and end dates for a reunion.
//
// Most family reunions run a weekend rather than an afternoon, so the wizard
// assumes multi-day and asks people to opt out. That assumption only helps if
// the end date arrives with it — a reunion marked multi-day with no end date
// is stored as, and behaves as, a single-day one, which is exactly the
// confusion the default was meant to remove.
//
// Pure, so the suggestion and the validation can be tested without a form.

import { addDays, daysBetween } from '@/lib/payment-schedule'

/**
 * How long a reunion runs when nobody has said otherwise.
 *
 * Two nights: the Friday-to-Sunday shape almost every family reunion takes.
 * It is a starting point in a date field the organiser can change, not a rule.
 */
export const DEFAULT_REUNION_SPAN_DAYS = 2

/** The end date to pre-fill once a start date is known. Null if it is not. */
export function suggestEndDate(startDate: string): string | null {
  if (!startDate) return null
  return addDays(startDate, DEFAULT_REUNION_SPAN_DAYS)
}

/**
 * Why these dates cannot be saved, or null if they can.
 *
 * A single-day reunion has no end date to check. A multi-day one needs an end
 * date that is actually after the start — a reunion ending before it begins is
 * a typo the wizard should catch at the field rather than at save.
 */
export function validateReunionDates(value: {
  startDate: string
  endDate: string | null
  multiDay: boolean
}): string | null {
  if (!value.startDate) return 'Pick a start date.'
  if (!value.multiDay) return null

  if (!value.endDate) return 'Pick an end date, or mark this as a single-day reunion.'

  const span = daysBetween(value.startDate, value.endDate)
  if (span < 0) return 'The end date is before the start date.'
  if (span === 0) return 'Start and end are the same day — mark this as a single-day reunion instead.'

  return null
}
