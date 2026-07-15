import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { createReunion } from '@/lib/actions/reunions'

export default async function NewReunionPage() {
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

  if (!['committee', 'admin'].includes(member?.role ?? '')) redirect('/dashboard')

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/dashboard">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Dashboard
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Create a Reunion</CardTitle>
          <CardDescription>
            Set up a new family reunion. You can add events, photos, and announcements after creating it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createReunion} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Reunion Name *</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="Smith Family Reunion 2025"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="year">Year *</Label>
              <Input
                id="year"
                name="year"
                type="number"
                required
                min="2000"
                max="2100"
                defaultValue={new Date().getFullYear()}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Tell the family what this reunion is about..."
                rows={4}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit">Create Reunion</Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
