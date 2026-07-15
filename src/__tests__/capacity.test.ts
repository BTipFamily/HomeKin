// Unit tests for capacity enforcement logic extracted from signups action.
// The action blocks when current_signups + new_headcount > capacity.

function checkCapacity(
  capacity: number | null,
  existingHeadcount: number,
  newHeadcount: number
): { allowed: boolean; message?: string } {
  if (!capacity) return { allowed: true }
  const remaining = capacity - existingHeadcount
  if (newHeadcount > remaining) {
    return {
      allowed: false,
      message: `Not enough capacity. Only ${remaining} spots remaining.`,
    }
  }
  return { allowed: true }
}

describe('Capacity enforcement', () => {
  test('no capacity limit always allows signup', () => {
    expect(checkCapacity(null, 50, 100).allowed).toBe(true)
  })

  test('first signup fits within capacity', () => {
    expect(checkCapacity(10, 0, 3).allowed).toBe(true)
  })

  test('signup that exactly fills remaining capacity is allowed', () => {
    expect(checkCapacity(10, 7, 3).allowed).toBe(true)
  })

  test('signup that exceeds remaining capacity is rejected', () => {
    const result = checkCapacity(10, 8, 3)
    expect(result.allowed).toBe(false)
    expect(result.message).toContain('2 spots remaining')
  })

  test('signup when event is already full is rejected', () => {
    const result = checkCapacity(10, 10, 1)
    expect(result.allowed).toBe(false)
    expect(result.message).toContain('0 spots remaining')
  })

  test('single headcount into 1 remaining spot is allowed', () => {
    expect(checkCapacity(5, 4, 1).allowed).toBe(true)
  })

  test('headcount of 2 into 1 remaining spot is rejected', () => {
    expect(checkCapacity(5, 4, 2).allowed).toBe(false)
  })
})

// Validate invite code format (8 chars, alphanumeric uppercase)
function isValidCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code)
}

describe('Invite code format', () => {
  test('8 uppercase alphanumeric chars are valid', () => {
    expect(isValidCodeFormat('AB12CD34')).toBe(true)
    expect(isValidCodeFormat('AAAAAAAA')).toBe(true)
    expect(isValidCodeFormat('12345678')).toBe(true)
  })

  test('lowercase is invalid', () => {
    expect(isValidCodeFormat('ab12cd34')).toBe(false)
  })

  test('less than 8 chars is invalid', () => {
    expect(isValidCodeFormat('AB12CD3')).toBe(false)
  })

  test('more than 8 chars is invalid', () => {
    expect(isValidCodeFormat('AB12CD345')).toBe(false)
  })

  test('special characters are invalid', () => {
    expect(isValidCodeFormat('AB12CD3!')).toBe(false)
  })
})

// Validate headcount must be >= 1
function isValidHeadcount(headcount: number): boolean {
  return Number.isInteger(headcount) && headcount >= 1
}

describe('Headcount validation', () => {
  test('headcount of 1 is valid', () => {
    expect(isValidHeadcount(1)).toBe(true)
  })

  test('headcount of 10 is valid', () => {
    expect(isValidHeadcount(10)).toBe(true)
  })

  test('headcount of 0 is invalid', () => {
    expect(isValidHeadcount(0)).toBe(false)
  })

  test('negative headcount is invalid', () => {
    expect(isValidHeadcount(-1)).toBe(false)
  })

  test('fractional headcount is invalid', () => {
    expect(isValidHeadcount(1.5)).toBe(false)
  })
})

// Running total calculation
function calcRunningTotal(signups: { cost_per_person: number; headcount: number }[]): number {
  return signups.reduce((sum, s) => sum + s.cost_per_person * s.headcount, 0)
}

describe('Running balance estimate', () => {
  test('empty signups = $0', () => {
    expect(calcRunningTotal([])).toBe(0)
  })

  test('one event, one person', () => {
    expect(calcRunningTotal([{ cost_per_person: 25, headcount: 1 }])).toBe(25)
  })

  test('multiple events with different headcounts', () => {
    expect(
      calcRunningTotal([
        { cost_per_person: 50, headcount: 2 },
        { cost_per_person: 20, headcount: 3 },
        { cost_per_person: 0, headcount: 4 },
      ])
    ).toBe(160) // 100 + 60 + 0
  })

  test('free events contribute $0', () => {
    expect(calcRunningTotal([{ cost_per_person: 0, headcount: 5 }])).toBe(0)
  })
})

// RLS role hierarchy
type Role = 'member' | 'committee' | 'admin'
function canManageReunion(role: Role): boolean {
  return ['committee', 'admin'].includes(role)
}
function isAdmin(role: Role): boolean {
  return role === 'admin'
}

describe('Role permission checks', () => {
  test('member cannot manage reunions', () => {
    expect(canManageReunion('member')).toBe(false)
  })

  test('committee can manage reunions', () => {
    expect(canManageReunion('committee')).toBe(true)
  })

  test('admin can manage reunions', () => {
    expect(canManageReunion('admin')).toBe(true)
  })

  test('only admin can access /admin panel', () => {
    expect(isAdmin('member')).toBe(false)
    expect(isAdmin('committee')).toBe(false)
    expect(isAdmin('admin')).toBe(true)
  })
})
