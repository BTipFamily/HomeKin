// The running order for the weekend.
//
// The invariant worth protecting: this is what gets printed and left on a
// table. An event in the wrong order, or on the wrong day because a date-only
// string slipped a timezone, sends people to the wrong place.

import {
  buildAgenda,
  formatAgendaDay,
  formatAgendaTime,
  type AgendaAttendee,
  type AgendaEvent,
} from '@/lib/agenda'

function event(overrides: Partial<AgendaEvent> & Pick<AgendaEvent, 'id' | 'date'>): AgendaEvent {
  return {
    name: 'Event',
    description: null,
    time: '12:00:00',
    duration_minutes: 60,
    location_name: null,
    cost_per_person: 0,
    capacity: null,
    booking_mode: 'homekin',
    vendor_name: null,
    ...overrides,
  }
}

function attendee(
  subEventId: string,
  memberId: string,
  memberName: string,
  headcount = 2
): AgendaAttendee {
  return {
    sub_event_id: subEventId,
    member_id: memberId,
    member_name: memberName,
    headcount,
    status: 'confirmed',
  }
}

describe('buildAgenda', () => {
  it('groups by day, in date order', () => {
    const days = buildAgenda(
      [
        event({ id: 'b', date: '2027-08-02' }),
        event({ id: 'a', date: '2027-08-01' }),
      ],
      [],
      {},
      'me'
    )

    expect(days.map((d) => d.date)).toEqual(['2027-08-01', '2027-08-02'])
  })

  it('orders a day by time', () => {
    const days = buildAgenda(
      [
        event({ id: 'lunch', date: '2027-08-01', time: '12:30:00', name: 'Lunch' }),
        event({ id: 'breakfast', date: '2027-08-01', time: '08:00:00', name: 'Breakfast' }),
        event({ id: 'dinner', date: '2027-08-01', time: '18:00:00', name: 'Dinner' }),
      ],
      [],
      {},
      'me'
    )

    expect(days[0].entries.map((e) => e.event.id)).toEqual(['breakfast', 'lunch', 'dinner'])
  })

  it('puts an untimed event last, not at midnight', () => {
    // "Sometime on Saturday" belongs after breakfast, not before it.
    const days = buildAgenda(
      [
        event({ id: 'whenever', date: '2027-08-01', time: null }),
        event({ id: 'breakfast', date: '2027-08-01', time: '08:00:00' }),
      ],
      [],
      {},
      'me'
    )

    expect(days[0].entries.map((e) => e.event.id)).toEqual(['breakfast', 'whenever'])
  })

  it('breaks a time tie by name, so the order is stable', () => {
    const days = buildAgenda(
      [
        event({ id: 'z', date: '2027-08-01', time: '09:00:00', name: 'Zoo' }),
        event({ id: 'a', date: '2027-08-01', time: '09:00:00', name: 'Archery' }),
      ],
      [],
      {},
      'me'
    )

    expect(days[0].entries.map((e) => e.event.name)).toEqual(['Archery', 'Zoo'])
  })

  it('takes headcounts from the lookup, not from the attendee rows', () => {
    // A member can only read their own signups, so counting the rows they can
    // see would show every event as nearly empty.
    const days = buildAgenda(
      [event({ id: 'picnic', date: '2027-08-01' })],
      [attendee('picnic', 'me', 'Me', 2)],
      { picnic: 24 },
      'me'
    )

    expect(days[0].entries[0].people).toBe(24)
    expect(days[0].people).toBe(24)
  })

  it('knows whether the viewer is going', () => {
    const days = buildAgenda(
      [event({ id: 'picnic', date: '2027-08-01' }), event({ id: 'hike', date: '2027-08-01' })],
      [attendee('picnic', 'me', 'Me')],
      {},
      'me'
    )

    const byId = Object.fromEntries(days[0].entries.map((e) => [e.event.id, e.goingMyself]))
    expect(byId.picnic).toBe(true)
    expect(byId.hike).toBe(false)
  })

  it('lists attendees alphabetically', () => {
    const days = buildAgenda(
      [event({ id: 'picnic', date: '2027-08-01' })],
      [
        attendee('picnic', 'm2', 'Zora'),
        attendee('picnic', 'm1', 'Ada'),
      ],
      {},
      'me'
    )

    expect(days[0].entries[0].attendees.map((a) => a.member_name)).toEqual(['Ada', 'Zora'])
  })

  it('shows an event nobody has signed up for', () => {
    const days = buildAgenda([event({ id: 'solo', date: '2027-08-01' })], [], {}, 'me')
    expect(days[0].entries[0].people).toBe(0)
    expect(days[0].entries[0].attendees).toEqual([])
  })

  it('has no days when there are no events', () => {
    expect(buildAgenda([], [], {}, 'me')).toEqual([])
  })
})

describe('formatting', () => {
  it('renders the day it says, not the day before', () => {
    // A date-only string parsed as local time lands on 31 July west of
    // Greenwich — the bug payment-schedule.ts avoids the same way.
    expect(formatAgendaDay('2027-08-01')).toBe('Sun, Aug 1')
  })

  it('renders a 12-hour time', () => {
    expect(formatAgendaTime('08:00:00')).toBe('8:00 AM')
    expect(formatAgendaTime('12:30:00')).toBe('12:30 PM')
    expect(formatAgendaTime('00:15:00')).toBe('12:15 AM')
    expect(formatAgendaTime('18:05')).toBe('6:05 PM')
  })

  it('has nothing to show for an untimed event', () => {
    expect(formatAgendaTime(null)).toBeNull()
  })
})
