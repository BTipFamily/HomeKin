import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { updateSubEvent } from '@/lib/actions/sub-events'
import DeadlineFields from '../../deadline-fields'
import type { EventDeadline } from '@/types/database'

interface EditEventPageProps {
  params: Promise<{ id: string; eventId: string }>
}

export default async function EditEventPage({ params }: EditEventPageProps) {
  const { id, eventId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (!['committee', 'admin'].includes(member?.role ?? '')) {
    redirect(`/reunion/${id}/events/${eventId}`)
  }

  const { data: event } = await supabase
    .from('sub_events')
    .select('*')
    .eq('id', eventId)
    .single()
  if (!event) notFound()

  const { data: deadlines } = await supabase
    .from('event_deadlines')
    .select('*')
    .eq('sub_event_id', eventId)
    .order('due_date')

  async function handleUpdate(formData: FormData) {
    'use server'
    await updateSubEvent(eventId, id, formData)
    redirect(`/reunion/${id}/events/${eventId}`)
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/reunion/${id}/events/${eventId}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to event
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Edit Event</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Event Name *</Label>
              <Input id="name" name="name" required defaultValue={event.name} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={event.description ?? ''}
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
                <Input id="date" name="date" type="date" required defaultValue={event.date} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Time</Label>
                <Input id="time" name="time" type="time" defaultValue={event.time ?? ''} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration_minutes">Approximate Length</Label>
              <select
                id="duration_minutes"
                name="duration_minutes"
                defaultValue={event.duration_minutes?.toString() ?? ''}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Not specified</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
                <option value="150">2.5 hours</option>
                <option value="180">3 hours</option>
                <option value="240">4 hours</option>
                <option value="300">5 hours</option>
                <option value="480">All day (8 hours)</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location_name">Location Name</Label>
              <Input
                id="location_name"
                name="location_name"
                defaultValue={event.location_name ?? ''}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                name="address"
                defaultValue={event.address ?? ''}
                rows={2}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cost_per_person">Cost Per Person ($)</Label>
                <Input
                  id="cost_per_person"
                  name="cost_per_person"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={event.cost_per_person}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">Max Capacity</Label>
                <Input
                  id="capacity"
                  name="capacity"
                  type="number"
                  min="1"
                  defaultValue={event.capacity ?? ''}
                  placeholder="Unlimited"
                />
              </div>
            </div>

            <DeadlineFields existing={(deadlines ?? []) as EventDeadline[]} />

            <div className="flex gap-3 pt-2">
              <Button type="submit">Save Changes</Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/reunion/${id}/events/${eventId}`}>Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
