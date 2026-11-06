// What the reunion page leads with.
//
// Advisory, like the phases it reads: these tests pin which one thing goes
// first, never what is reachable.

import { formatDateRange, hubHero, type HubContext } from '@/lib/reunion-hub'
import { REUNION_PHASES, type ReunionPhase } from '@/lib/reunion-phase'

const ctx = (over: Partial<HubContext>): HubContext => ({
  phase: 'planning',
  canManage: false,
  hasAnsweredInterest: false,
  outstanding: 0,
  ...over,
})

describe('hubHero for a family member', () => {
  it('asks for an interest answer while interest is being gathered', () => {
    expect(hubHero(ctx({ phase: 'interest' })).primary).toEqual({
      path: 'interest',
      label: 'Tell us if you can come',
    })
    expect(hubHero(ctx({ phase: 'interest', hasAnsweredInterest: true })).primary?.label).toBe(
      'Update your answer'
    )
  })

  it('still asks for an answer during planning, since it can change the date', () => {
    expect(hubHero(ctx({ phase: 'planning' })).primary?.path).toBe('interest')
    expect(hubHero(ctx({ phase: 'planning', hasAnsweredInterest: true })).primary?.path).toBe(
      'chat'
    )
  })

  it('leads with the bill during registration when one is due', () => {
    const hero = hubHero(ctx({ phase: 'registration', outstanding: 85 }))
    expect(hero.primary).toEqual({ path: 'signups', label: 'Pay $85.00 still due' })
    // Not said twice.
    expect(hero.secondary).toBeNull()
  })

  it('invites signups during registration when nothing is owed', () => {
    expect(hubHero(ctx({ phase: 'registration' })).primary?.path).toBe('events')
  })

  it('surfaces money owed in other phases as a secondary link', () => {
    const hero = hubHero(ctx({ phase: 'finalized', outstanding: 20 }))
    expect(hero.primary?.path).toBe('agenda')
    expect(hero.secondary?.path).toBe('signups')
  })

  it('stops chasing money once the reunion is over', () => {
    expect(hubHero(ctx({ phase: 'completed', outstanding: 20 })).secondary).toBeNull()
  })

  it('offers no button while the reunion is still a draft', () => {
    expect(hubHero(ctx({ phase: 'draft' })).primary).toBeNull()
  })

  it('uses the member summary, not the committee one', () => {
    expect(hubHero(ctx({ phase: 'registration' })).summary).toMatch(/Sign up your household/)
  })
})

describe('hubHero for the committee', () => {
  it('points every phase somewhere', () => {
    for (const phase of REUNION_PHASES) {
      expect(hubHero(ctx({ phase, canManage: true })).primary).not.toBeNull()
    }
  })

  it('sends them to planning while interest comes in, and asks for their own answer', () => {
    const hero = hubHero(ctx({ phase: 'interest', canManage: true }))
    expect(hero.primary?.path).toBe('planning')
    expect(hero.secondary?.path).toBe('interest')
  })

  it('uses the committee summary', () => {
    expect(hubHero(ctx({ phase: 'registration', canManage: true })).summary).toMatch(/Chase/)
  })
})

it('treats an unrecognised phase as planning rather than rendering nothing', () => {
  const hero = hubHero(ctx({ phase: 'archived' as ReunionPhase, canManage: true }))
  expect(hero.phaseLabel).toBe('Planning')
  expect(hero.primary?.path).toBe('planning')
})

describe('formatDateRange', () => {
  it('is null without a start date', () => {
    expect(formatDateRange(null, null)).toBeNull()
    expect(formatDateRange(null, '2027-07-12')).toBeNull()
  })

  it('shows a single day once', () => {
    expect(formatDateRange('2027-07-10', null)).toBe('Jul 10, 2027')
    expect(formatDateRange('2027-07-10', '2027-07-10')).toBe('Jul 10, 2027')
  })

  it('collapses a range inside one month', () => {
    expect(formatDateRange('2027-07-10', '2027-07-12')).toBe('Jul 10–12, 2027')
  })

  it('names both months across a month boundary', () => {
    expect(formatDateRange('2027-07-30', '2027-08-02')).toBe('Jul 30 – Aug 2, 2027')
  })

  it('names both years across new year', () => {
    expect(formatDateRange('2027-12-30', '2028-01-02')).toBe('Dec 30, 2027 – Jan 2, 2028')
  })
})
