// Turning a last-seen timestamp into something honest to show a person.
//
// There is no disconnect signal — a browser that closes simply stops
// heartbeating — so nobody is ever reported as "offline" with confidence. The
// wording is deliberately "active", meaning recently seen, not "online".

/** How often the browser refreshes its heartbeat. */
export const HEARTBEAT_INTERVAL_MS = 60_000

/**
 * Twice the heartbeat plus slack: one missed beat (a sleeping tab, a flaky
 * connection) should not drop someone out of the list.
 */
export const ACTIVE_WINDOW_MS = 150_000

export type Presence = 'active' | 'today' | 'away'

export function presenceOf(lastSeenAt: string | null, now = Date.now()): Presence {
  if (!lastSeenAt) return 'away'

  const seen = Date.parse(lastSeenAt)
  if (!Number.isFinite(seen)) return 'away'

  const elapsed = now - seen
  // A clock skewed into the future still means "just seen".
  if (elapsed < ACTIVE_WINDOW_MS) return 'active'
  if (elapsed < 24 * 60 * 60 * 1000) return 'today'
  return 'away'
}

export function describePresence(presence: Presence): string {
  switch (presence) {
    case 'active':
      return 'Active now'
    case 'today':
      return 'Active today'
    default:
      return 'Not recently active'
  }
}

export type RosterMember = {
  id: string
  name: string
  photo_url: string | null
  last_seen_at: string | null
}

export type RosterEntry = RosterMember & { presence: Presence }

/**
 * Sorts a roster into active, then today, then everyone else — each group
 * alphabetical, so the list does not reshuffle as timestamps tick over.
 */
export function buildRoster(members: RosterMember[], now = Date.now()): RosterEntry[] {
  const rank: Record<Presence, number> = { active: 0, today: 1, away: 2 }

  return members
    .map((member) => ({ ...member, presence: presenceOf(member.last_seen_at, now) }))
    .sort(
      (a, b) => rank[a.presence] - rank[b.presence] || a.name.localeCompare(b.name)
    )
}

export function countActive(roster: RosterEntry[]): number {
  return roster.filter((r) => r.presence === 'active').length
}
