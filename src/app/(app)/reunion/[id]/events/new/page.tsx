import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { createSubEvent } from '@/lib/actions/sub-events'
import DeadlineFields from '../deadline-fields'
import { BookingFields } from '../booking-fields'
import EventFormShell from '../event-form-shell'

interface NewEventPageProps {
  params: Promise<{ id: string }>
}

export default async function NewEventPage({ params }: NewEventPageProps) {
  const { id } = await params
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
  if (!['committee', 'admin'].includes(member?.role ?? '')) redirect(`/reunion/${id}/events`)

  const { data: reunion } = await supabase
    .from('reunions')
    .select('name')
    .eq('id', id)
    .single()

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/reunion/${id}/events`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {reunion?.name} Events
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Add Event</CardTitle>
          <CardDescription>
            Add a sub-event for this reunion. Members can sign up after you save it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EventFormShell
            action={createSubEvent.bind(null, id)}
            submitLabel="Create Event"
            cancelHref={`/reunion/${id}/events`}
          >
            <div className="space-y-2">
              <Label htmlFor="name">Event Name *</Label>
              <Input id="name" name="name" required placeholder="Family Cookout" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="What's happening at this event?"
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
                <Input id="date" name="date" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Time</Label>
                <Input id="time" name="time" type="time" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration_minutes">Approximate Length</Label>
              <select
                id="duration_minutes"
                name="duration_minutes"
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
                placeholder="Riverside Park Pavilion"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                name="address"
                placeholder="123 Park Ave, City, ST 12345"
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
                  defaultValue="0"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">Max Capacity</Label>
                <Input
                  id="capacity"
                  name="capacity"
                  type="number"
                  min="1"
                  placeholder="Leave blank for unlimited"
                />
              </div>
            </div>

            <BookingFields />

            <DeadlineFields />
          </EventFormShell>
        </CardContent>
      </Card>
    </div>
  )
}
