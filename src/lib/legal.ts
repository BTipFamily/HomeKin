// The details that appear in the Terms and the Privacy Policy.
//
// One place, because a contact address that is right on one page and stale on
// the other is worse than either — and because App Store review checks that the
// address in the policy actually reaches somebody.
//
// THESE MUST BE REAL BEFORE SUBMITTING. App Store guideline 1.2 requires
// published contact details for an app carrying user content, and a reviewer
// will mail the address. `legalContactEmail()` falls back to a value that is
// obviously a placeholder rather than one that looks plausible, so an
// unconfigured deployment is caught by reading the page rather than by a
// rejection.

// Read as CONTACT_EMAIL, deliberately not NEXT_PUBLIC_CONTACT_EMAIL. A
// NEXT_PUBLIC_ variable is inlined at build time, so setting it in the hosting
// dashboard after a deploy changes nothing until the next build — which is a
// trap: the page keeps showing the placeholder and the variable looks set. Both
// legal pages are Server Components and never need this in the browser, so a
// plain server variable is read fresh on every request.
export function legalContactEmail(): string {
  return process.env.CONTACT_EMAIL || 'SET_CONTACT_EMAIL@example.com'
}

export function contactIsConfigured(): boolean {
  return Boolean(process.env.CONTACT_EMAIL)
}

/** Shown as "Last updated" on both pages. Bump when the text changes. */
export const LEGAL_LAST_UPDATED = '2026-08-09'

/**
 * How quickly reported content is looked at.
 *
 * 24 hours is not a number picked for comfort: it is what App Store guideline
 * 1.2 requires an app with user-generated content to commit to, and the
 * committee queue at /admin/reports is what makes it possible to honour.
 */
export const MODERATION_RESPONSE_HOURS = 24

/** The services family data actually passes through, and what each one does. */
export const SUBPROCESSORS: { name: string; purpose: string }[] = [
  { name: 'Supabase', purpose: 'Database, logins, and photo and video storage' },
  { name: 'Vercel', purpose: 'Hosting the app, and anonymous page-view analytics' },
  { name: 'Stripe', purpose: 'Card payments for reunion costs' },
  { name: 'Mapbox', purpose: 'The travel map, and turning addresses into map coordinates' },
  { name: 'Gmail', purpose: 'Sending invitations, reminders and statements by email' },
]
