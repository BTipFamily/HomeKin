import {
  ACTIVE_WINDOW_MS,
  buildRoster,
  countActive,
  describePresence,
  presenceOf,
  type RosterMember,
} from '@/lib/presence'

const NOW = Date.parse('2026-01-01T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

function member(over: Partial<RosterMember> = {}): RosterMember {
  return { id: 'm1', name: 'Jane', photo_url: null, last_seen_at: null, ...over }
}

describe('presenceOf', () => {
  test('counts a recent heartbeat as active', () => {
    expect(presenceOf(ago(10_000), NOW)).toBe('active')
    expect(presenceOf(ago(ACTIVE_WINDOW_MS - 1_000), NOW)).toBe('active')
  })

  test('survives one missed heartbeat', () => {
    // A sleeping tab or a flaky connection should not drop someone off the list.
    expect(presenceOf(ago(70_000), NOW)).toBe('active')
  })

  test('drops to today once well past the window', () => {
    expect(presenceOf(ago(ACTIVE_WINDOW_MS + 1_000), NOW)).toBe('today')
    expect(presenceOf(ago(6 * 60 * 60 * 1000), NOW)).toBe('today')
  })

  test('is away after a day, or if never seen', () => {
    expect(presenceOf(ago(25 * 60 * 60 * 1000), NOW)).toBe('away')
    expect(presenceOf(null, NOW)).toBe('away')
  })

  test('treats a future timestamp as just seen rather than away', () => {
    // A client clock running ahead should not read as "not recently active".
    expect(presenceOf(new Date(NOW + 30_000).toISOString(), NOW)).toBe('active')
  })

  test('handles an unparseable timestamp', () => {
    expect(presenceOf('not a date', NOW)).toBe('away')
  })
})

describe('describePresence', () => {
  test('never claims someone is online, only recently active', () => {
    // There is no disconnect signal, so the wording has to stay honest.
    expect(describePresence('active')).toBe('Active now')
    expect(describePresence('today')).toBe('Active today')
    expect(describePresence('away')).toBe('Not recently active')
  })
})

describe('buildRoster', () => {
  test('groups active first, then today, then away', () => {
    const roster = buildRoster(
      [
        member({ id: 'away', name: 'Zoe', last_seen_at: null }),
        member({ id: 'today', name: 'Bob', last_seen_at: ago(3 * 60 * 60 * 1000) }),
        member({ id: 'active', name: 'Ann', last_seen_at: ago(5_000) }),
      ],
      NOW
    )
    expect(roster.map((r) => r.id)).toEqual(['active', 'today', 'away'])
  })

  test('sorts alphabetically inside a group, so the list stays stable', () => {
    const roster = buildRoster(
      [
        member({ id: '1', name: 'Zoe', last_seen_at: ago(5_000) }),
        member({ id: '2', name: 'Ann', last_seen_at: ago(9_000) }),
      ],
      NOW
    )
    expect(roster.map((r) => r.name)).toEqual(['Ann', 'Zoe'])
  })

  test('handles an empty directory', () => {
    expect(buildRoster([], NOW)).toEqual([])
  })
})

describe('countActive', () => {
  test('counts only the active bucket', () => {
    const roster = buildRoster(
      [
        member({ id: '1', name: 'A', last_seen_at: ago(5_000) }),
        member({ id: '2', name: 'B', last_seen_at: ago(9_000) }),
        member({ id: '3', name: 'C', last_seen_at: ago(5 * 60 * 60 * 1000) }),
        member({ id: '4', name: 'D', last_seen_at: null }),
      ],
      NOW
    )
    expect(countActive(roster)).toBe(2)
  })
})
