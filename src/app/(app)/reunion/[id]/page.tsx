import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Pin, Plus, Trash2, Calendar, Camera, Users } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { createAnnouncement, deleteAnnouncement } from '@/lib/actions/announcements'

interface ReunionPageProps {
  params: Promise<{ id: string }>
}

export default async function ReunionPage({ params }: ReunionPageProps) {
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
    .select('*')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  // Announcements — pinned first, then newest
  const { data: announcements } = await supabase
    .from('announcements')
    .select('*, author:created_by(id, name, photo_url)')
    .eq('reunion_id', id)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  // Counts for quick stats
  const { count: eventCount } = await supabase
    .from('sub_events')
    .select('*', { count: 'exact', head: true })
    .eq('reunion_id', id)

  const { count: photoCount } = await supabase
    .from('photos')
    .select('*', { count: 'exact', head: true })
    .eq('reunion_id', id)

  const canManage = ['committee', 'admin'].includes(member.role)

  async function handleCreateAnnouncement(formData: FormData) {
    'use server'
    await createAnnouncement(id, formData)
  }

  async function handleDeleteAnnouncement(announcementId: string) {
    'use server'
    await deleteAnnouncement(announcementId, id)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Reunion header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{reunion.name}</h1>
        {reunion.description && (
          <p className="mt-1 text-muted-foreground">{reunion.description}</p>
        )}
      </div>

      {/* Quick nav */}
      <div className="mb-8 grid grid-cols-3 gap-3">
        <Button asChild variant="outline" className="flex-col h-auto py-3 gap-1">
          <Link href={`/reunion/${id}/events`}>
            <Calendar className="h-5 w-5" />
            <span className="text-xs">Events ({eventCount ?? 0})</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="flex-col h-auto py-3 gap-1">
          <Link href={`/reunion/${id}/signups`}>
            <Users className="h-5 w-5" />
            <span className="text-xs">My Signups</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="flex-col h-auto py-3 gap-1">
          <Link href={`/reunion/${id}/photos`}>
            <Camera className="h-5 w-5" />
            <span className="text-xs">Photos ({photoCount ?? 0})</span>
          </Link>
        </Button>
      </div>

      {/* Post announcement form (committee/admin) */}
      {canManage && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <form action={handleCreateAnnouncement} className="space-y-3">
              <p className="text-sm font-medium">Post an Announcement</p>
              <input
                name="title"
                required
                placeholder="Title"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <textarea
                name="body"
                required
                placeholder="Write your announcement..."
                rows={3}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" name="pinned" className="rounded" />
                  Pin to top
                </label>
                <Button type="submit" size="sm">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Post
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Announcements feed */}
      <div className="space-y-4">
        <h2 className="font-semibold text-lg">Announcements</h2>
        {(!announcements || announcements.length === 0) ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <p>No announcements yet.</p>
            {canManage && (
              <p className="mt-1 text-sm">Post one above to keep everyone updated.</p>
            )}
          </div>
        ) : (
          announcements.map((a) => (
            <Card key={a.id} className={a.pinned ? 'border-primary/30 bg-primary/5' : ''}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {a.pinned && (
                        <Pin className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                      <h3 className="font-semibold">{a.title}</h3>
                    </div>
                    <p className="mt-2 text-sm whitespace-pre-wrap leading-relaxed">{a.body}</p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{(a as any).author?.name ?? 'Committee'}</span>
                      <span>·</span>
                      <span>{new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {canManage && (
                    <form
                      action={async () => {
                        'use server'
                        await deleteAnnouncement(a.id, id)
                      }}
                    >
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
