import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, Users, Camera, Megaphone, Plus, ArrowRight, Settings } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface DashboardPageProps {
  searchParams: Promise<{ deleted?: string; warning?: string }>
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { deleted, warning } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, name, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) redirect('/login')

  // Get all reunions
  const { data: reunions } = await supabase
    .from('reunions')
    .select('*')
    .order('year', { ascending: false })

  // Get member count
  const { count: memberCount } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true })

  const canManage = ['committee', 'admin'].includes(member.role)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Confirmation for a reunion deleted from its (now gone) manage page. */}
      {deleted && (
        <div
          className={`mb-6 rounded-lg border p-4 text-sm ${
            warning
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-green-200 bg-green-50 text-green-900'
          }`}
        >
          <p className="font-medium">&ldquo;{deleted}&rdquo; has been deleted.</p>
          {warning && <p className="mt-1">{warning}</p>}
        </div>
      )}

      {/* Welcome header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Welcome back, {member.name.split(' ')[0]}!</h1>
        <p className="mt-1 text-muted-foreground">
          {memberCount} family members and counting.
        </p>
      </div>

      {/* Quick stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Members</p>
                <p className="text-3xl font-bold">{memberCount ?? 0}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground/40" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Reunions</p>
                <p className="text-3xl font-bold">{reunions?.length ?? 0}</p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground/40" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reunions section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Reunions</h2>
          {canManage && (
            <Button asChild size="sm">
              <Link href="/reunion/new">
                <Plus className="mr-1.5 h-4 w-4" />
                New Reunion
              </Link>
            </Button>
          )}
        </div>

        {(!reunions || reunions.length === 0) ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
              <h3 className="font-medium">No reunions yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {canManage
                  ? 'Create the first reunion to get started.'
                  : 'Check back soon — your committee is setting things up.'}
              </p>
              {canManage && (
                <Button asChild className="mt-4">
                  <Link href="/reunion/new">Create reunion</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reunions.map((reunion) => (
              <Card key={reunion.id} className="group transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{reunion.name}</CardTitle>
                    <Badge variant="secondary">{reunion.year}</Badge>
                  </div>
                  {reunion.description && (
                    <CardDescription className="line-clamp-2">
                      {reunion.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Button asChild variant="outline" size="sm" className="flex-1">
                      <Link href={`/reunion/${reunion.id}`}>
                        Open
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/reunion/${reunion.id}/events`}>
                        <Calendar className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/reunion/${reunion.id}/photos`}>
                        <Camera className="h-4 w-4" />
                      </Link>
                    </Button>
                    {canManage && (
                      <Button asChild variant="ghost" size="sm" title="Manage this reunion">
                        <Link href={`/reunion/${reunion.id}/manage`}>
                          <Settings className="h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Member Directory</p>
                <p className="text-xs text-muted-foreground">Browse all family members</p>
              </div>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/directory">View <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
        {member.role === 'admin' && (
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <Megaphone className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Admin Panel</p>
                  <p className="text-xs text-muted-foreground">Manage members & invites</p>
                </div>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin">Open <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
