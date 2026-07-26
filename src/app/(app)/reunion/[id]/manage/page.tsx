import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Calendar, Users, DollarSign } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { updateReunion } from '@/lib/actions/reunions'
import { DeleteReunion } from './delete-reunion'

interface ManagePageProps {
  params: Promise<{ id: string }>
}

export default async function ManagePage({ params }: ManagePageProps) {
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
  if (!member || !['committee', 'admin'].includes(member.role)) {
    redirect(`/reunion/${id}`)
  }

  const { data: reunion } = await supabase
    .from('reunions')
    .select('*')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  // Stats
  const { count: eventCount } = await supabase
    .from('sub_events')
    .select('*', { count: 'exact', head: true })
    .eq('reunion_id', id)

  const { count: signupCount } = await supabase
    .from('signups')
    .select('*, sub_event:sub_event_id!inner(reunion_id)', { count: 'exact', head: true })
    .eq('sub_event.reunion_id', id)

  // Total expected revenue from signups
  const { data: signupData } = await supabase
    .from('signups')
    .select('headcount, sub_event:sub_event_id!inner(cost_per_person, reunion_id)')
    .eq('sub_event.reunion_id', id)

  const totalExpected = signupData?.reduce((sum, s) => {
    const event = (s as any).sub_event
    return sum + (event?.cost_per_person ?? 0) * s.headcount
  }, 0) ?? 0

  async function handleUpdateReunion(formData: FormData) {
    'use server'
    await updateReunion(id, formData)
    redirect(`/reunion/${id}/manage`)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/reunion/${id}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {reunion.name}
        </Link>
      </Button>

      <h1 className="mb-6 text-2xl font-bold">Manage Reunion</h1>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Events</p>
                <p className="text-2xl font-bold">{eventCount ?? 0}</p>
              </div>
              <Calendar className="h-7 w-7 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Signups</p>
                <p className="text-2xl font-bold">{signupCount ?? 0}</p>
              </div>
              <Users className="h-7 w-7 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Expected Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(totalExpected)}</p>
              </div>
              <DollarSign className="h-7 w-7 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit reunion details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Reunion Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleUpdateReunion} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required defaultValue={reunion.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                name="year"
                type="number"
                required
                defaultValue={reunion.year}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  name="start_date"
                  type="date"
                  defaultValue={reunion.start_date ?? ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  name="end_date"
                  type="date"
                  min={reunion.start_date ?? undefined}
                  defaultValue={reunion.end_date ?? ''}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              The start date drives the{' '}
              <Link href={`/reunion/${id}/timeline`} className="underline">
                Timeline
              </Link>{' '}
              planning steps.
            </p>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={reunion.description ?? ''}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location_name">Location Name</Label>
              <Input
                id="location_name"
                name="location_name"
                placeholder="e.g. Grandma Rose's House"
                defaultValue={reunion.location_name ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                name="address"
                placeholder="Used to place this reunion on the travel map"
                defaultValue={reunion.address ?? ''}
                rows={2}
              />
            </div>
            <Button type="submit" size="sm">Save Changes</Button>
          </form>
        </CardContent>
      </Card>

      {/* Quick links for committee */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/reunion/${id}/events/new`}>
              <Calendar className="mr-1.5 h-4 w-4" />
              Add Event
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/reunion/${id}/signups`}>
              <Users className="mr-1.5 h-4 w-4" />
              View All Signups
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Committee can manage a reunion, but only an admin can destroy one. */}
      {member.role === 'admin' && (
        <DeleteReunion reunionId={id} reunionName={reunion.name} />
      )}
    </div>
  )
}
