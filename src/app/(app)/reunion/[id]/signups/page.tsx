import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Calendar, DollarSign, Users, AlertCircle } from 'lucide-react'
import { formatDate, formatTime, formatCurrency } from '@/lib/utils'

interface SignupsPageProps {
  params: Promise<{ id: string }>
}

export default async function SignupsPage({ params }: SignupsPageProps) {
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

  // Get member's signups with sub-event details
  const { data: signups } = await supabase
    .from('signups')
    .select('*, sub_event:sub_event_id(id, name, date, time, location_name, cost_per_person)')
    .eq('member_id', member.id)
    .order('created_at')

  // Filter to events in this reunion
  const reunionEventIds = signups?.filter((s) => {
    const e = (s as any).sub_event
    return e !== null
  })

  // Get all events in this reunion to check which belong here
  const { data: reunionEvents } = await supabase
    .from('sub_events')
    .select('id')
    .eq('reunion_id', id)

  const reunionEventIdSet = new Set(reunionEvents?.map((e) => e.id) ?? [])

  const mySignups = signups?.filter((s) => reunionEventIdSet.has(s.sub_event_id)) ?? []

  // Calculate running total
  const estimatedTotal = mySignups.reduce((sum, s) => {
    const event = (s as any).sub_event
    if (!event) return sum
    return sum + event.cost_per_person * s.headcount
  }, 0)

  // Committee view: all signups
  const canManage = ['committee', 'admin'].includes(member.role)
  let allSignups: any[] = []
  if (canManage) {
    const { data } = await supabase
      .from('signups')
      .select('*, member:member_id(id, name), sub_event:sub_event_id(id, name, date, cost_per_person)')
      .in('sub_event_id', [...reunionEventIdSet])
      .order('created_at')
    allSignups = data ?? []
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/reunion/${id}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {reunion.name}
        </Link>
      </Button>

      <h1 className="mb-6 text-2xl font-bold">My Signups</h1>

      {/* My signups */}
      {mySignups.length === 0 ? (
        <Card className="mb-8">
          <CardContent className="py-10 text-center text-muted-foreground">
            <Calendar className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p>You haven't signed up for any events yet.</p>
            <Button asChild className="mt-4" variant="outline" size="sm">
              <Link href={`/reunion/${id}/events`}>Browse events</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mb-8 space-y-4">
          {mySignups.map((signup) => {
            const event = (signup as any).sub_event
            if (!event) return null
            const subtotal = event.cost_per_person * signup.headcount

            return (
              <Card key={signup.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{event.name}</p>
                        <Badge
                          variant={signup.status === 'confirmed' ? 'default' : 'outline'}
                          className="text-xs"
                        >
                          {signup.status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {formatDate(event.date)}
                        {event.time && ` · ${formatTime(event.time)}`}
                        {event.location_name && ` · ${event.location_name}`}
                      </p>
                      <p className="mt-1 text-sm">
                        <Users className="mr-1 h-3.5 w-3.5 inline" />
                        {signup.headcount} {signup.headcount === 1 ? 'person' : 'people'}
                        {signup.guest_names && (
                          <span className="text-muted-foreground"> ({signup.guest_names})</span>
                        )}
                      </p>
                    </div>
                    {event.cost_per_person > 0 && (
                      <div className="text-right shrink-0">
                        <p className="font-semibold">{formatCurrency(subtotal)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(event.cost_per_person)} × {signup.headcount}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/reunion/${id}/events/${signup.sub_event_id}`}>
                        Manage signup
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* Running total */}
          {estimatedTotal > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <span className="font-medium">Estimated Total</span>
                  </div>
                  <span className="text-xl font-bold text-primary">
                    {formatCurrency(estimatedTotal)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Payment collection coming in Phase 2. Contact the committee for payment instructions.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Committee: all signups summary */}
      {canManage && allSignups.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">All Signups (Committee View)</h2>
          <Card>
            <CardContent className="pt-4">
              <div className="divide-y">
                {allSignups.map((signup) => {
                  const m = signup.member
                  const event = signup.sub_event
                  return (
                    <div key={signup.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-medium">{m?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {event?.name} · ×{signup.headcount}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        {event?.cost_per_person > 0 && (
                          <span className="text-sm">
                            {formatCurrency(event.cost_per_person * signup.headcount)}
                          </span>
                        )}
                        <Badge variant={signup.status === 'confirmed' ? 'default' : 'outline'} className="text-xs">
                          {signup.status}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
              <Separator className="my-3" />
              <div className="flex justify-between text-sm font-medium">
                <span>Total collected</span>
                <span>
                  {formatCurrency(
                    allSignups.reduce((sum, s) => {
                      return sum + ((s.sub_event?.cost_per_person ?? 0) * s.headcount)
                    }, 0)
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
