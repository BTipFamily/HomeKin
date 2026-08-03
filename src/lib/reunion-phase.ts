// What stage a reunion is at, and what that means for what people see.
//
// Advisory by design. These helpers decide what the app *leads with* and what
// it *suggests next* — never what it forbids. An organiser who has not moved
// the reunion to 'registration' yet should not thereby have locked a relative
// out of paying a deposit they were asked for.
//
// Pure, so the ordering and the copy can be tested without a database.

export type ReunionPhase =
  | 'draft'
  | 'interest'
  | 'planning'
  | 'registration'
  | 'finalized'
  | 'completed'

/** In the order a reunion actually moves through them. */
export const REUNION_PHASES: ReunionPhase[] = [
  'draft',
  'interest',
  'planning',
  'registration',
  'finalized',
  'completed',
]

type PhaseCopy = {
  /** Shown on a badge. */
  label: string
  /** One line telling a family member what is happening right now. */
  memberSummary: string
  /** What the committee is expected to be doing. */
  committeeSummary: string
}

const COPY: Record<ReunionPhase, PhaseCopy> = {
  draft: {
    label: 'Draft',
    memberSummary: 'This reunion is still being set up.',
    committeeSummary: 'Fill in the basics, then open it for interest.',
  },
  interest: {
    label: 'Gathering interest',
    memberSummary: 'Tell the committee whether you hope to come — nothing is fixed yet.',
    committeeSummary: 'Collecting interest responses to size the reunion.',
  },
  planning: {
    label: 'Planning',
    memberSummary: 'The committee is working out the date, the place and the cost.',
    committeeSummary: 'Settle the date and location, then open registration.',
  },
  registration: {
    label: 'Registration open',
    memberSummary: 'Sign up your household and pay when you are ready.',
    committeeSummary: 'Chase signups and payments.',
  },
  finalized: {
    label: 'Finalized',
    memberSummary: 'Everything is set — check the schedule and what to bring.',
    committeeSummary: 'Numbers are locked. Confirm vendors and volunteers.',
  },
  completed: {
    label: 'Completed',
    memberSummary: 'This reunion has happened. Photos and memories live on here.',
    committeeSummary: 'Share photos, send the thank-you, and close the books.',
  },
}

export function phaseCopy(phase: ReunionPhase): PhaseCopy {
  return COPY[phase] ?? COPY.planning
}

export function phaseIndex(phase: ReunionPhase): number {
  const index = REUNION_PHASES.indexOf(phase)
  return index === -1 ? REUNION_PHASES.indexOf('planning') : index
}

/** True once the reunion has reached `phase` — used to decide what to lead with. */
export function hasReached(current: ReunionPhase, phase: ReunionPhase): boolean {
  return phaseIndex(current) >= phaseIndex(phase)
}

export function nextPhase(current: ReunionPhase): ReunionPhase | null {
  const index = phaseIndex(current)
  return index >= REUNION_PHASES.length - 1 ? null : REUNION_PHASES[index + 1]
}

/**
 * Which section the reunion page should put first.
 *
 * Not which sections exist — everything stays reachable. This only answers
 * "what is this family most likely here to do today".
 */
export function primaryCallToAction(
  phase: ReunionPhase
): 'setup' | 'interest' | 'watch' | 'register' | 'schedule' | 'photos' {
  switch (phase) {
    case 'draft':
      return 'setup'
    case 'interest':
      return 'interest'
    case 'planning':
      return 'watch'
    case 'registration':
      return 'register'
    case 'finalized':
      return 'schedule'
    case 'completed':
      return 'photos'
  }
}

/**
 * Whether the app should actively invite someone to sign up and pay.
 *
 * Note what this is not: permission. Signup and payment pages stay reachable in
 * every phase, because a family asked for a deposit during planning must be
 * able to send it. This only governs whether the app brings it up unprompted.
 */
export function shouldInviteRegistration(phase: ReunionPhase): boolean {
  return phase === 'registration' || phase === 'finalized'
}

export function shouldInviteInterest(phase: ReunionPhase): boolean {
  return phase === 'interest'
}
