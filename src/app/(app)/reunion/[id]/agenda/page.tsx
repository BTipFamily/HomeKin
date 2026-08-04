import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Clock, MapPin, Users, ExternalLink } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  buildAgenda,
  formatAgendaDay,
  formatAgendaTime,
  type AgendaAttendee,
  type AgendaEvent,
} from '@/lib/agenda'
import type { BookingMode } from '@/lib/event-pricing'

interface AgendaPageProps {
  params: Promise<{ id: string }>
}

const MODE_LABEL: Record<BookingMode, string | null> = {
  // The ordinary case needs no badge — a label on everything is noise.
  homekin: null,
  direct: 'Book with vendor',
  group: 'Group rate',
}

export default async function AgendaPage({ params }: AgendaPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) redirect('/login')

  const { data: reunion } = await supabase
    .from('reunions')
    .select('id, name')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  const isCommittee = ['committee', 'admin'].includes(member.role)

  const { data: events } = await supabase
    .from('sub_events')
    .select(
      'id, name, description, date, time, duration_minutes, location_name, cost_per_person, capacity, booking_mode, vendor_name'
    )
    .eq('reunion_id', id)
    .order('date')
    .order('time')

  // Headcounts come from the security-definer function: the signups select
  // policy shows a member only their own rows, so counting what they can read
  // would render every event as empty.
  const [{ data: headcountRows }, { data: signupRows }] = await Promise.all([
    supabase.rpc('event_headcounts', { p_reunion: id }),
    supabase
      .from('signups')
      .select('sub_event_id, member_id, headcount, status, member:member_id(id, name)')
      .in('sub_event_id', (events ?? []).map((e) => e.id)),
  ])

  const headcounts = Object.fromEntries(
    ((headcountRows ?? []) as { sub_event_id: string; headcount: number }[]).map((row) => [
      row.sub_event_id,
      Number(row.headcount),
    ])
  )

  const attendees: AgendaAttendee[] = (
    (signupRows ?? []) as unknown as {
      sub_event_id: string
      member_id: string
      headcount: number
      status: 'pending' | 'confirmed'
      member?: { id: string; name: string } | null
    }[]
  ).map((row) => ({
    sub_event_id: row.sub_event_id,
    member_id: row.member_id,
    member_name: row.member?.name ?? 'Someone',
    headcount: Number(row.headcount),
    status: row.status,
  }))

  const days = buildAgenda(
    (events ?? []) as unknown as AgendaEvent[],
    attendees,
    headcounts,
    member.id
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="print:hidden">
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
          <Link href={`/reunion/${id}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {reunion.name}
          </Link>
        </Button>
      </div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            {reunion.name} — everything that is happening, in order.
          </p>
        </div>
      </div>

      {days.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p>No events yet. Once the committee adds some, they show up here by day.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {days.map((day) => (
            <section key={day.date}>
              <div className="mb-3 flex items-baseline justify-between gap-3 border-b pb-1.5">
                <h2 className="text-lg font-semibold">{formatAgendaDay(day.date)}</h2>
                {day.people > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {day.people} {day.people === 1 ? 'person' : 'people'} across the day
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {day.entries.map(({ event, attendees: going, people, goingMyself }) => {
                  const badge = MODE_LABEL[event.booking_mode]
                  const time = formatAgendaTime(event.time)
                  return (
                    <div
                      key={event.id}
                      className={`rounded-lg border p-3 ${goingMyself ? 'border-primary/40 bg-primary/5' : ''}`}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link
                          href={`/reunion/${id}/events/${event.id}`}
                          className="font-medium hover:underline"
                        >
                          {event.name}
                        </Link>
                        <div className="flex items-center gap-1.5">
                          {goingMyself && (
                            <Badge variant="secondary" className="text-[11px]">
                              You&rsquo;re going
                            </Badge>
                          )}
                          {badge && (
                            <Badge variant="outline" className="text-[11px]">
                              {badge}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {time ?? 'Time to be confirmed'}
                        </span>
                        {event.location_name && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.location_name}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {people} going
                          {event.capacity ? ` of ${event.capacity}` : ''}
                        </span>
                        {event.cost_per_person > 0 && (
                          <span>
                            {formatCurrency(event.cost_per_person)} each
                            {event.booking_mode === 'group' && ' before group rate'}
                          </span>
                        )}
                        {event.vendor_name && (
                          <span className="flex items-center gap-1">
                            <ExternalLink className="h-3 w-3" />
                            {event.vendor_name}
                          </span>
                        )}
                      </div>

                      {/* Names only for the committee. An ordinary member can
                          read just their own signup, so listing what they can
                          see would show a roster of one and read as though
                          nobody else was coming. */}
                      {isCommittee && going.length > 0 && (
                        <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                          {going
                            .map((a) => `${a.member_name}${a.headcount > 1 ? ` (${a.headcount})` : ''}`)
                            .join(', ')}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
