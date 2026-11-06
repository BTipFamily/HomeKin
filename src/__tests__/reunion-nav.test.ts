// The sections of a reunion, named once.
//
// The invariants worth protecting: one name per page (it was "Budget" in the
// bar and "Payments" on the reunion page), committee tools never shown to
// members, and highlighting that follows nested pages without bleeding into a
// neighbour whose path merely starts the same way.

import {
  MOBILE_TAB_PATHS,
  isActiveSection,
  reunionSections,
  sectionHref,
} from '@/lib/reunion-nav'

const R = 'r1'

describe('reunionSections', () => {
  it('gives every path exactly one name', () => {
    const paths = reunionSections(true).map((s) => s.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('calls /budget Payments', () => {
    expect(reunionSections(true).find((s) => s.path === 'budget')?.label).toBe('Payments')
  })

  it('hides committee tools from members', () => {
    const member = reunionSections(false).map((s) => s.path)
    for (const path of ['planning', 'invitations', 'budget', 'report', 'manage']) {
      expect(member).not.toContain(path)
    }
    // Readable by everyone, so still listed.
    expect(member).toContain('timeline')
    expect(member).toContain('budget-estimator')
  })

  it('lists the family sections before the planning ones', () => {
    const groups = reunionSections(true).map((s) => s.group)
    expect(groups.lastIndexOf('family')).toBeLessThan(groups.indexOf('planning'))
  })

  it('puts only sections everyone can open in the phone bar', () => {
    const member = reunionSections(false).map((s) => s.path)
    for (const path of MOBILE_TAB_PATHS) expect(member).toContain(path)
  })
})

describe('isActiveSection', () => {
  it('lights a section on its own page and pages inside it', () => {
    expect(isActiveSection('/reunion/r1/events', R, 'events')).toBe(true)
    expect(isActiveSection('/reunion/r1/events/e9/edit', R, 'events')).toBe(true)
    expect(isActiveSection('/reunion/r1/events/', R, 'events')).toBe(true)
  })

  it('does not light Payments on the Budget Estimator', () => {
    expect(isActiveSection('/reunion/r1/budget-estimator', R, 'budget')).toBe(false)
    expect(isActiveSection('/reunion/r1/budget', R, 'budget')).toBe(true)
  })

  it('lights Overview only on the reunion page itself', () => {
    expect(isActiveSection('/reunion/r1', R, '')).toBe(true)
    expect(isActiveSection('/reunion/r1/', R, '')).toBe(true)
    expect(isActiveSection('/reunion/r1/chat', R, '')).toBe(false)
  })

  it('does not match another reunion', () => {
    expect(isActiveSection('/reunion/r10/events', R, 'events')).toBe(false)
  })
})

it('builds hrefs with and without a section', () => {
  expect(sectionHref(R, '')).toBe('/reunion/r1')
  expect(sectionHref(R, 'chat')).toBe('/reunion/r1/chat')
})
