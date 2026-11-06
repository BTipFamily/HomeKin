// What the reunion page leads with.
//
// The page used to open on thirteen tiles of equal weight whatever stage the
// reunion was at, so "tell us if you can come" and "pay your deposit" were each
// one tile among many. This picks the one thing this person is most likely here
// to do, from the phase and the little we know about them.
//
// Advisory, like everything built on reunion-phase: it decides what is put
// first, never what is reachable. Every tile stays on the page.
//
// Pure, so the choice can be tested without a database.

import {
  REUNION_PHASES,
  phaseCopy,
  phaseIndex,
  primaryCallToAction,
  type ReunionPhase,
} from '@/lib/reunion-phase'
import { formatCurrency } from '@/lib/utils'

export type HubLink = {
  /** Relative to /reunion/[id]; empty string is the reunion page itself. */
  path: string
  label: string
}

export type HubHero = {
  phaseLabel: string
  summary: string
  primary: HubLink | null
  secondary: HubLink | null
}

export type HubContext = {
  phase: ReunionPhase
  canManage: boolean
  /** Whether this member has answered the interest form. */
  hasAnsweredInterest: boolean
  /** What this member still owes, from summarizeBalances. */
  outstanding: number
}

function payLink(outstanding: number): HubLink {
  return { path: 'signups', label: `Pay ${formatCurrency(outstanding)} still due` }
}

function interestLink(answered: boolean): HubLink {
  return answered
    ? { path: 'interest', label: 'Update your answer' }
    : { path: 'interest', label: 'Tell us if you can come' }
}

function committeePrimary(cta: ReturnType<typeof primaryCallToAction>): HubLink {
  switch (cta) {
    case 'setup':
      return { path: 'manage', label: 'Finish the details' }
    case 'interest':
      return { path: 'planning', label: 'See who can come' }
    case 'watch':
      return { path: 'planning', label: 'Settle the date and place' }
    case 'register':
      return { path: 'budget', label: 'Review signups and payments' }
    case 'schedule':
      return { path: 'agenda', label: 'See the schedule' }
    case 'photos':
      return { path: 'photos', label: 'Share the photos' }
  }
}

function memberPrimary(
  cta: ReturnType<typeof primaryCallToAction>,
  ctx: HubContext
): HubLink | null {
  switch (cta) {
    case 'setup':
      // Nothing for a relative to do yet, and a button that leads nowhere
      // useful is worse than none.
      return null
    case 'interest':
      return interestLink(ctx.hasAnsweredInterest)
    case 'watch':
      // The committee is choosing a date from the interest answers, so a
      // household that has not answered can still change the outcome.
      return ctx.hasAnsweredInterest
        ? { path: 'chat', label: 'Join the family chat' }
        : interestLink(false)
    case 'register':
      return ctx.outstanding > 0
        ? payLink(ctx.outstanding)
        : { path: 'events', label: 'Sign up for events' }
    case 'schedule':
      return { path: 'agenda', label: 'See the schedule' }
    case 'photos':
      return { path: 'photos', label: 'Browse and add photos' }
  }
}

export function hubHero(ctx: HubContext): HubHero {
  // An unrecognised phase reads as planning everywhere else, so here too —
  // primaryCallToAction has no fallback of its own.
  const phase = REUNION_PHASES[phaseIndex(ctx.phase)]
  const copy = phaseCopy(phase)
  const cta = primaryCallToAction(phase)

  const primary = ctx.canManage ? committeePrimary(cta) : memberPrimary(cta, ctx)

  // Money owed is surfaced in every phase but the last — not as an invitation
  // to register, but because it is this person's own bill. Skipped when the
  // primary button already says it.
  let secondary: HubLink | null = null
  if (ctx.outstanding > 0 && phase !== 'completed' && primary?.path !== 'signups') {
    secondary = payLink(ctx.outstanding)
  } else if (ctx.canManage && cta === 'interest' && !ctx.hasAnsweredInterest) {
    // Committee members are family too, and their own answer counts.
    secondary = { path: 'interest', label: 'Answer for your household' }
  }

  return {
    phaseLabel: copy.label,
    summary: ctx.canManage ? copy.committeeSummary : copy.memberSummary,
    primary,
    secondary,
  }
}

function parseDay(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * "Jul 10–12, 2027", "Jul 30 – Aug 2, 2027", "Dec 30, 2027 – Jan 2, 2028".
 * Null when no date is set, so the caller can leave the line out entirely.
 */
export function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start) return null
  const s = parseDay(start)
  const md = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const full = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  if (!end || end === start) return full(s)
  const e = parseDay(end)

  if (s.getFullYear() !== e.getFullYear()) return `${full(s)} – ${full(e)}`
  if (s.getMonth() !== e.getMonth()) return `${md(s)} – ${md(e)}, ${e.getFullYear()}`
  return `${md(s)}–${e.getDate()}, ${e.getFullYear()}`
}
