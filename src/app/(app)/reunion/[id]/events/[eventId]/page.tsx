import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Calendar, Clock, MapPin, Users, DollarSign, Edit, Trash2 } from 'lucide-react'
import { formatDate, formatTime, formatCurrency, formatDuration, getInitials } from '@/lib/utils'
import { upsertSignup, cancelSignup } from '@/lib/actions/signups'
import { deleteSubEvent } from '@/lib/actions/sub-events'

interface EventDetailPageProps {
  params: Promise<{ id: string; eventId: string }>
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { id, eventId } = await params
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

  const { data: event } = await supabase
    .from('sub_events')
    .select('*')
    .eq('id', eventId)
    .eq('reunion_id', id)
    .single()
  if (!event) notFound()

  const { data: reunion } = await supabase
    .from('reunions')
    .select('id, name')
    .eq('id', id)
    .single()

  // Get all signups with member names
  const { data: signups } = await supabase
    .from('signups')
    .select('*, member:member_id(id, name, photo_url)')
    .eq('sub_event_id', eventId)
    .order('created_at')

  const mySignup = signups?.find((s) => s.member_id === member.id)
  const totalSignedUp = signups?.reduce((sum, s) => sum + s.headcount, 0) ?? 0
  const isFull = event.capacity !== null && totalSignedUp >= event.capacity
  const canManage = ['committee', 'admin'].includes(member.role)

  async function handleSignup(formData: FormData) {
    'use server'
    formData.set('sub_event_id', eventId)
    await upsertSignup(formData)
    redirect(`/reunion/${id}/events/${eventId}`)
  }

  async function handleCancel() {
    'use server'
    if (!mySignup) return
    await cancelSignup(mySignup.id, id, eventId)
    redirect(`/reunion/${id}/events/${eventId}`)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/reunion/${id}/events`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {reunion?.name} Events
        </Link>
      </Button>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-xl">{event.name}</CardTitle>
            {canManage && (
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/reunion/${id}/events/${eventId}/edit`}>
                    <Edit className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Link>
                </Button>
                <form
                  action={async () => {
                    'use server'
                    await deleteSubEvent(eventId, id)
                  }}
                >
                  <Button
                    type="submit"
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </form>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {event.description && (
            <p className="mb-4 text-muted-foreground">{event.description}</p>
          )}

          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{formatDate(event.date)}</span>
            </div>
            {event.time && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>
                  {formatTime(event.time)}
                  {event.duration_minutes
                    ? ` · ${formatDuration(event.duration_minutes)}`
                    : ''}
                </span>
              </div>
            )}
            {!event.time && event.duration_minutes && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{formatDuration(event.duration_minutes)}</span>
              </div>
            )}
            {event.location_name && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p>{event.location_name}</p>
                  {event.address && (
                    <p className="text-muted-foreground">{event.address}</p>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>
                {totalSignedUp} signed up
                {event.capacity && ` of ${event.capacity} capacity`}
              </span>
              {isFull && <Badge variant="secondary">Full</Badge>}
            </div>
            {event.cost_per_person > 0 && (
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span>{formatCurrency(event.cost_per_person)} per person</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Signup form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">
            {mySignup ? 'Your Signup' : 'Sign Up'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mySignup ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md bg-success/10 px-4 py-3">
                <Badge className="bg-green-600 text-white shrink-0">
                  {mySignup.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                </Badge>
                <div className="text-sm">
                  <p>
                    <strong>{mySignup.headcount} {mySignup.headcount === 1 ? 'person' : 'people'}</strong>
                    {event.cost_per_person > 0 && (
                      <span className="text-muted-foreground ml-1">
                        — {formatCurrency(event.cost_per_person * mySignup.headcount)} total
                      </span>
                    )}
                  </p>
                  {mySignup.guest_names && (
                    <p className="text-muted-foreground mt-0.5">{mySignup.guest_names}</p>
                  )}
                </div>
              </div>

              {/* Edit form */}
              <form action={handleSignup} className="space-y-3">
                <input type="hidden" name="sub_event_id" value={eventId} />
                <div className="space-y-1">
                  <label className="text-sm font-medium">Update headcount</label>
                  <input
                    name="headcount"
                    type="number"
                    min="1"
                    defaultValue={mySignup.headcount}
                    max={event.capacity ?? undefined}
                    className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Guest names (optional)</label>
                  <input
                    name="guest_names"
                    defaultValue={mySignup.guest_names ?? ''}
                    placeholder="e.g. Sarah, Junior"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <Button type="submit" size="sm">Update Signup</Button>
              </form>
              <form action={handleCancel}>
                <Button type="submit" size="sm" variant="destructive">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Cancel Signup
                </Button>
              </form>
            </div>
          ) : isFull ? (
            <p className="text-sm text-muted-foreground">
              This event is at capacity. Contact the committee to be added to a waitlist.
            </p>
          ) : (
            <form action={handleSignup} className="space-y-3">
              <input type="hidden" name="sub_event_id" value={eventId} />
              <div className="space-y-1">
                <label className="text-sm font-medium">Number of people (including yourself)</label>
                <input
                  name="headcount"
                  type="number"
                  min="1"
                  defaultValue="1"
                  max={event.capacity ? event.capacity - totalSignedUp : undefined}
                  className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Guest names{' '}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                  name="guest_names"
                  placeholder="e.g. Sarah, Junior"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              {event.cost_per_person > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(event.cost_per_person)} × headcount will be added to your balance.
                  Payment is handled separately.
                </p>
              )}
              <Button type="submit">Sign Up</Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Who's going */}
      {signups && signups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Who's Going ({signups.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {signups.map((signup) => {
                const m = (signup as any).member
                return (
                  <div key={signup.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        {m?.photo_url && <AvatarImage src={m.photo_url} alt={m?.name} />}
                        <AvatarFallback className="text-xs">{getInitials(m?.name ?? '?')}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{m?.name ?? 'Unknown'}</p>
                        {signup.guest_names && (
                          <p className="text-xs text-muted-foreground">+ {signup.guest_names}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        ×{signup.headcount}
                      </span>
                      <Badge
                        variant={signup.status === 'confirmed' ? 'default' : 'outline'}
                        className="text-xs"
                      >
                        {signup.status}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
