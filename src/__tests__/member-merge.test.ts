import {
  canonicalEmail,
  completeness,
  findDuplicatePairs,
  mergeRole,
  normalizeName,
  normalizePhone,
  previewFieldOutcomes,
  scorePair,
  splitNameSuffix,
  willAdoptLogin,
  willOrphanLogin,
  type MergeCandidate,
} from '@/lib/member-merge'

let seq = 0
function member(overrides: Partial<MergeCandidate> = {}): MergeCandidate {
  seq += 1
  return {
    id: `id-${seq}`,
    name: 'Jane Smith',
    email: `jane${seq}@example.com`,
    phone: null,
    address: null,
    family_branch: null,
    date_of_birth: null,
    bio: null,
    photo_url: null,
    gender: null,
    role: 'member',
    social_links: {},
    auth_user_id: null,
    created_by_proxy: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('normalization', () => {
  test('canonicalEmail collapses gmail dots and plus tags', () => {
    expect(canonicalEmail('Joe.Smith+reunion@Gmail.com')).toBe('joesmith@gmail.com')
    expect(canonicalEmail('joesmith@googlemail.com')).toBe('joesmith@gmail.com')
  })

  test('canonicalEmail leaves other providers dots alone', () => {
    // Only the plus tag is a convention outside Gmail; dots are significant.
    expect(canonicalEmail('joe.smith+x@outlook.com')).toBe('joe.smith@outlook.com')
    expect(canonicalEmail('joe.smith@outlook.com')).toBe('joe.smith@outlook.com')
  })

  test('splitNameSuffix separates generational suffixes', () => {
    expect(splitNameSuffix('John Smith Jr.')).toEqual({ base: 'john smith', suffix: 'jr' })
    expect(splitNameSuffix('John Smith III')).toEqual({ base: 'john smith', suffix: 'iii' })
    expect(splitNameSuffix('John Smith')).toEqual({ base: 'john smith', suffix: '' })
  })

  test('normalizeName folds case, punctuation and spacing', () => {
    expect(normalizeName('  Jane   O.Smith ')).toBe('jane o smith')
  })

  test('normalizePhone keeps digits and drops the US country code', () => {
    expect(normalizePhone('+1 (555) 010-1234')).toBe('5550101234')
    expect(normalizePhone('555-0101')).toBe('5550101')
    expect(normalizePhone(null)).toBe('')
  })
})

describe('scorePair', () => {
  test('an identical email is the strongest signal', () => {
    const pair = scorePair(
      member({ email: 'jane@example.com' }),
      member({ email: 'JANE@example.com', name: 'J Smith' })
    )
    expect(pair?.score).toBeGreaterThanOrEqual(100)
    expect(pair?.reasons).toContain('Same email address')
  })

  test('catches the same inbox written differently', () => {
    const pair = scorePair(
      member({ email: 'joe.smith@gmail.com', name: 'Joe Smith' }),
      member({ email: 'joesmith+reunion@gmail.com', name: 'Joe Smith' })
    )
    expect(pair).not.toBeNull()
    expect(pair!.reasons).toContain('Same email inbox, written differently')
  })

  test('same name plus date of birth scores high', () => {
    const pair = scorePair(
      member({ date_of_birth: '1980-04-01' }),
      member({ date_of_birth: '1980-04-01' })
    )
    expect(pair!.score).toBeGreaterThanOrEqual(96)
  })

  test('same name alone is surfaced but ranked low', () => {
    const pair = scorePair(member(), member())
    expect(pair!.score).toBeLessThan(72)
    expect(pair!.reasons).toContain('Same name')
  })

  test('a claimed/unclaimed split nudges the score up', () => {
    const plain = scorePair(member(), member())!
    const split = scorePair(member({ created_by_proxy: true }), member())!
    expect(split.score).toBeGreaterThan(plain.score)
    expect(split.reasons).toContain('One profile has been claimed, the other has not')
  })

  // The two cases where surfacing a pair would invite a destructive mistake.
  test('never pairs a Jr with a Sr', () => {
    expect(
      scorePair(member({ name: 'John Smith Jr' }), member({ name: 'John Smith Sr' }))
    ).toBeNull()
  })

  test('never pairs two people with different birth dates', () => {
    expect(
      scorePair(
        member({ name: 'John Smith', date_of_birth: '1980-04-01' }),
        member({ name: 'John Smith', date_of_birth: '1955-04-01' })
      )
    ).toBeNull()
  })

  test('a suffix on only one side is still a candidate', () => {
    expect(scorePair(member({ name: 'John Smith Jr' }), member({ name: 'John Smith' }))).not.toBeNull()
  })

  test('unrelated people are not paired', () => {
    expect(scorePair(member({ name: 'Jane Smith' }), member({ name: 'Bob Jones' }))).toBeNull()
  })

  test('a member is never paired with itself', () => {
    const m = member()
    expect(scorePair(m, m)).toBeNull()
  })

  test('two blank phone numbers do not count as a match', () => {
    expect(
      scorePair(member({ name: 'Jane Smith', phone: '' }), member({ name: 'Bob Jones', phone: '' }))
    ).toBeNull()
  })
})

describe('pickKeeper', () => {
  test('keeps the more complete profile', () => {
    const sparse = member({ email: 'a@x.com' })
    const rich = member({ email: 'a@x.com', phone: '555-1111', address: '9 Oak St', bio: 'Hi' })
    expect(scorePair(sparse, rich)!.keep.id).toBe(rich.id)
    expect(scorePair(rich, sparse)!.keep.id).toBe(rich.id)
  })

  test('breaks ties on the older record', () => {
    const older = member({ email: 'a@x.com', created_at: '2025-01-01T00:00:00Z' })
    const newer = member({ email: 'a@x.com', created_at: '2026-06-01T00:00:00Z' })
    expect(scorePair(newer, older)!.keep.id).toBe(older.id)
  })

  test('completeness counts social links', () => {
    expect(completeness(member())).toBe(0)
    expect(completeness(member({ phone: '1', social_links: { facebook: 'fb' } }))).toBe(2)
    expect(completeness(member({ phone: '   ' }))).toBe(0)
  })
})

describe('findDuplicatePairs', () => {
  test('ranks the strongest match first', () => {
    const pairs = findDuplicatePairs([
      member({ id: 'a', name: 'Jane Smith' }),
      member({ id: 'b', name: 'Jane Smith' }),
      member({ id: 'c', name: 'Bob Jones', email: 'bob@x.com' }),
      member({ id: 'd', name: 'Robert Jones', email: 'BOB@x.com' }),
    ])
    expect(pairs).toHaveLength(2)
    expect(pairs[0].score).toBe(100)
    expect([pairs[0].keep.id, pairs[0].remove.id].sort()).toEqual(['c', 'd'])
  })

  test('returns nothing for a clean directory', () => {
    expect(
      findDuplicatePairs([
        member({ name: 'Jane Smith', email: 'a@x.com' }),
        member({ name: 'Bob Jones', email: 'b@x.com' }),
      ])
    ).toEqual([])
  })

  test('handles an empty directory', () => {
    expect(findDuplicatePairs([])).toEqual([])
  })
})

describe('previewFieldOutcomes', () => {
  const keep = member({
    name: 'Jane Smith',
    email: 'jane@example.com',
    phone: '555-1111',
    social_links: { facebook: 'fb/jane' },
  })
  const remove = member({
    name: 'Jane Smith',
    email: 'jane.new@example.com',
    address: '9 Oak St',
    bio: 'Loves gardening.',
    social_links: { facebook: 'fb/other', instagram: 'ig/jane' },
  })
  const byField = Object.fromEntries(
    previewFieldOutcomes(keep, remove).map((o) => [o.field, o])
  )

  test('the kept value wins where it has one', () => {
    expect(byField.phone.result).toBe('555-1111')
    expect(byField.facebook.result).toBe('fb/jane')
  })

  test('blanks are filled from the profile being removed', () => {
    expect(byField.address.result).toBe('9 Oak St')
    expect(byField.address.filledFromRemoved).toBe(true)
    expect(byField.instagram.result).toBe('ig/jane')
  })

  test('email is never taken from the profile being removed', () => {
    expect(byField.email.result).toBe('jane@example.com')
    expect(byField.email.filledFromRemoved).toBe(false)
  })

  test('a whitespace-only value counts as blank', () => {
    const outcomes = previewFieldOutcomes(
      member({ bio: '   ' }),
      member({ bio: 'Real bio' })
    )
    expect(outcomes.find((o) => o.field === 'bio')!.result).toBe('Real bio')
  })

  test('role is promoted, never demoted', () => {
    expect(mergeRole('member', 'committee')).toBe('committee')
    expect(mergeRole('admin', 'member')).toBe('admin')
    expect(mergeRole('committee', 'admin')).toBe('admin')

    const outcomes = previewFieldOutcomes(member({ role: 'member' }), member({ role: 'admin' }))
    const role = outcomes.find((o) => o.field === 'role')!
    expect(role.result).toBe('admin')
    expect(role.filledFromRemoved).toBe(true)
  })
})

describe('login handling', () => {
  test('the kept profile adopts a login it does not have', () => {
    expect(willAdoptLogin(member(), member({ auth_user_id: 'u1' }))).toBe(true)
    expect(willOrphanLogin(member(), member({ auth_user_id: 'u1' }))).toBe(false)
  })

  test('two logins means one gets orphaned', () => {
    const a = member({ auth_user_id: 'u1' })
    const b = member({ auth_user_id: 'u2' })
    expect(willOrphanLogin(a, b)).toBe(true)
    expect(willAdoptLogin(a, b)).toBe(false)
  })

  test('neither profile having a login is not a warning', () => {
    expect(willAdoptLogin(member(), member())).toBe(false)
    expect(willOrphanLogin(member(), member())).toBe(false)
  })
})
