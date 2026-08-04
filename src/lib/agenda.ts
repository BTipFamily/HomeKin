// The running order for the weekend.
//
// Distinct from the planning timeline, which is the committee's to-do list in
// the months beforehand. This is what happens on the day, in order, with who is
// going — the thing that gets printed and left on a table by the door.
//
// Pure, so the grouping and ordering are testable without a database.

import type { BookingMode } from '@/lib/event-pricing'

export type AgendaEvent = {
  id: string
  name: string
  description: string | null
  /** 'YYYY-MM-DD'. */
  date: string
  /** 'HH:MM' or 'HH:MM:SS', or null for "sometime that day". */
  time: string | null
  duration_minutes: number | null
  location_name: string | null
  cost_per_person: number
  capacity: number | null
  booking_mode: BookingMode
  vendor_name: string | null
}

export type AgendaAttendee = {
  sub_event_id: string
  member_id: string
  member_name: string
  headcount: number
  status: 'pending' | 'confirmed'
}

export type AgendaEntry = {
  event: AgendaEvent
  /**
   * Who is going. Empty for an ordinary member, who cannot read other people's
   * signups — see `people` for what they get instead.
   */
  attendees: AgendaAttendee[]
  /** Total people, which every viewer can see. */
  people: number
  /** Whether the viewer is among them. */
  goingMyself: boolean
}

export type AgendaDay = {
  /** 'YYYY-MM-DD'. */
  date: string
  entries: AgendaEntry[]
  /** People across the day, counting somebody at two events twice. */
  people: number
}

/**
 * Minutes past midnight, for ordering. Untimed events sort last: "sometime on
 * Saturday" belongs after everything with a slot, not at 00:00 ahead of
 * breakfast.
 */
function minutesOf(time: string | null): number {
  if (!time) return Number.MAX_SAFE_INTEGER
  const [hours, minutes] = time.split(':').map(Number)
  if (!Number.isFinite(hours)) return Number.MAX_SAFE_INTEGER
  return hours * 60 + (Number.isFinite(minutes) ? minutes : 0)
}

/**
 * Groups events into days, each in running order.
 *
 * `headcounts` comes from the event_headcounts SQL function rather than from
 * the signup rows, because an ordinary member can only read their own signups
 * and would otherwise see every event as empty.
 */
export function buildAgenda(
  events: AgendaEvent[],
  attendees: AgendaAttendee[],
  headcounts: Record<string, number>,
  currentMemberId: string
): AgendaDay[] {
  const byEvent = new Map<string, AgendaAttendee[]>()
  for (const attendee of attendees) {
    const list = byEvent.get(attendee.sub_event_id) ?? []
    list.push(attendee)
    byEvent.set(attendee.sub_event_id, list)
  }

  const byDate = new Map<string, AgendaEntry[]>()

  for (const event of events) {
    const eventAttendees = (byEvent.get(event.id) ?? []).sort((a, b) =>
      a.member_name.localeCompare(b.member_name)
    )

    const entry: AgendaEntry = {
      event,
      attendees: eventAttendees,
      people: headcounts[event.id] ?? 0,
      goingMyself: eventAttendees.some((a) => a.member_id === currentMemberId),
    }

    const list = byDate.get(event.date) ?? []
    list.push(entry)
    byDate.set(event.date, list)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({
      date,
      entries: entries.sort(
        (a, b) =>
          minutesOf(a.event.time) - minutesOf(b.event.time) ||
          a.event.name.localeCompare(b.event.name)
      ),
      people: entries.reduce((sum, entry) => sum + entry.people, 0),
    }))
}

/** "Sat 1 Aug" — a heading, not a sentence. */
export function formatAgendaDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  // Built in UTC so a date-only string does not slip a day west of Greenwich,
  // the same reason payment-schedule.ts avoids new Date(string).
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/** '2:30 PM', or null when the event has no set time. */
export function formatAgendaTime(time: string | null): string | null {
  if (!time) return null
  const [hours, minutes] = time.split(':').map(Number)
  if (!Number.isFinite(hours)) return null
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const display = hours % 12 === 0 ? 12 : hours % 12
  return `${display}:${String(Number.isFinite(minutes) ? minutes : 0).padStart(2, '0')} ${suffix}`
}
