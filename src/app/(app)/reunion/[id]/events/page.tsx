import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Calendar, MapPin, Clock, Users, DollarSign, ArrowRight } from 'lucide-react'
import { formatDate, formatTime, formatCurrency } from '@/lib/utils'

interface EventsPageProps {
  params: Promise<{ id: string }>
}

export default async function EventsPage({ params }: EventsPageProps) {
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

  const { data: events } = await supabase
    .from('sub_events')
    .select('*')
    .eq('reunion_id', id)
    .order('date')
    .order('time')

  // Get user's signups
  const { data: userSignups } = await supabase
    .from('signups')
    .select('sub_event_id, headcount, status')
    .eq('member_id', member.id)

  const signupMap = new Map(userSignups?.map((s) => [s.sub_event_id, s]) ?? [])

  // Get signup counts per event
  const { data: signupCounts } = await supabase
    .from('signups')
    .select('sub_event_id')
    .in('sub_event_id', events?.map((e) => e.id) ?? [])

  const countMap = new Map<string, number>()
  signupCounts?.forEach((s) => {
    countMap.set(s.sub_event_id, (countMap.get(s.sub_event_id) ?? 0) + 1)
  })

  const canManage = ['committee', 'admin'].includes(member.role)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link
            href={`/reunion/${id}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← {reunion.name}
          </Link>
          <h1 className="text-2xl font-bold">Events</h1>
        </div>
        {canManage && (
          <Button asChild size="sm">
            <Link href={`/reunion/${id}/events/new`}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Event
            </Link>
          </Button>
        )}
      </div>

      {(!events || events.length === 0) ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <Calendar className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p>No events yet.</p>
          {canManage && (
            <Button asChild className="mt-4">
              <Link href={`/reunion/${id}/events/new`}>Add the first event</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event) => {
            const mySignup = signupMap.get(event.id)
            const signedUpCount = countMap.get(event.id) ?? 0
            const isFull = event.capacity !== null && signedUpCount >= event.capacity

            return (
              <Card key={event.id} className="group">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{event.name}</CardTitle>
                      {event.description && (
                        <CardDescription className="mt-0.5">{event.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {mySignup && (
                        <Badge className="bg-green-500/10 text-green-700 border-green-200">
                          Signed up ({mySignup.headcount})
                        </Badge>
                      )}
                      {isFull && !mySignup && (
                        <Badge variant="secondary">Full</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(event.date)}
                    </span>
                    {event.time && (
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTime(event.time)}
                      </span>
                    )}
                    {event.location_name && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {event.location_name}
                      </span>
                    )}
                    {event.cost_per_person > 0 && (
                      <span className="flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5" />
                        {formatCurrency(event.cost_per_person)} / person
                      </span>
                    )}
                    {event.capacity && (
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        {signedUpCount}/{event.capacity} spots
                      </span>
                    )}
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/reunion/${id}/events/${event.id}`}>
                      {mySignup ? 'Manage signup' : 'View & sign up'}
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
