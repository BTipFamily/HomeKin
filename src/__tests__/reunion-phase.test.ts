// What stage a reunion is at.
//
// The invariant worth protecting: these helpers are advisory. Nothing here may
// grow into permission. A family asked for a deposit while the committee is
// still "planning" has to be able to pay it, so the only question these answer
// is what the app leads with.

import {
  REUNION_PHASES,
  hasReached,
  nextPhase,
  phaseCopy,
  phaseIndex,
  primaryCallToAction,
  shouldInviteInterest,
  shouldInviteRegistration,
  type ReunionPhase,
} from '@/lib/reunion-phase'

describe('phase ordering', () => {
  it('runs in the order a reunion actually moves through', () => {
    expect(REUNION_PHASES).toEqual([
      'draft',
      'interest',
      'planning',
      'registration',
      'finalized',
      'completed',
    ])
  })

  it('knows what has been reached', () => {
    expect(hasReached('registration', 'interest')).toBe(true)
    expect(hasReached('registration', 'registration')).toBe(true)
    expect(hasReached('interest', 'registration')).toBe(false)
  })

  it('advances one step and stops at the end', () => {
    expect(nextPhase('draft')).toBe('interest')
    expect(nextPhase('finalized')).toBe('completed')
    expect(nextPhase('completed')).toBeNull()
  })

  it('treats an unrecognised phase as planning rather than throwing', () => {
    // The column is a CHECK constraint, but a row written before a future
    // phase is added should still render.
    const unknown = 'archived' as ReunionPhase
    expect(phaseIndex(unknown)).toBe(REUNION_PHASES.indexOf('planning'))
    expect(phaseCopy(unknown).label).toBe('Planning')
  })
})

describe('what the app leads with', () => {
  it('points each phase at the thing someone came to do', () => {
    expect(primaryCallToAction('draft')).toBe('setup')
    expect(primaryCallToAction('interest')).toBe('interest')
    expect(primaryCallToAction('planning')).toBe('watch')
    expect(primaryCallToAction('registration')).toBe('register')
    expect(primaryCallToAction('finalized')).toBe('schedule')
    expect(primaryCallToAction('completed')).toBe('photos')
  })

  it('invites registration once it is open, and while everything is set', () => {
    expect(shouldInviteRegistration('registration')).toBe(true)
    expect(shouldInviteRegistration('finalized')).toBe(true)
  })

  it('does not invite registration before there is a date', () => {
    // Not the same as forbidding it — see the module comment.
    expect(shouldInviteRegistration('interest')).toBe(false)
    expect(shouldInviteRegistration('planning')).toBe(false)
  })

  it('asks for interest only while that is the question', () => {
    expect(shouldInviteInterest('interest')).toBe(true)
    expect(shouldInviteInterest('planning')).toBe(false)
    expect(shouldInviteInterest('completed')).toBe(false)
  })

  it('gives every phase copy for both audiences', () => {
    for (const phase of REUNION_PHASES) {
      const copy = phaseCopy(phase)
      expect(copy.label.length).toBeGreaterThan(0)
      expect(copy.memberSummary.length).toBeGreaterThan(0)
      expect(copy.committeeSummary.length).toBeGreaterThan(0)
    }
  })
})
