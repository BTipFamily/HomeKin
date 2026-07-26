import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Pin, Trash2, Calendar, Camera, Users, MessageCircle, ClipboardList, DollarSign, ListChecks, Wallet, Settings, FileText } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { deleteAnnouncement } from '@/lib/actions/announcements'
import { AnnouncementForm } from './announcement-form'
import { getUnreadCounts, markChannelRead } from '@/lib/actions/chat'

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

  const { count: surveyCount } = await supabase
    .from('surveys')
    .select('*', { count: 'exact', head: true })
    .eq('reunion_id', id)

  // Announcements email the whole directory, so show the author how many people
  // that is before they hit Post.
  const { count: memberCount } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true })

  const canManage = ['committee', 'admin'].includes(member.role)

  const unread = (await getUnreadCounts())[id]
  const unreadChat = unread?.chat ?? 0
  const unreadPosts = unread?.announcements ?? 0

  // Opening the reunion page counts as having seen its announcements. The chat
  // is marked read separately, when the chat itself is opened.
  if (unreadPosts > 0) await markChannelRead(id, null, 'announcements')

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
            <span className="text-xs">Signups & Pay</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="flex-col h-auto py-3 gap-1">
          <Link href={`/reunion/${id}/chat`} className="relative">
            <MessageCircle className="h-5 w-5" />
            <span className="text-xs">Chat</span>
            {unreadChat > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                {unreadChat > 99 ? '99+' : unreadChat}
              </span>
            )}
          </Link>
        </Button>
        <Button asChild variant="outline" className="flex-col h-auto py-3 gap-1">
          <Link href={`/reunion/${id}/photos`}>
            <Camera className="h-5 w-5" />
            <span className="text-xs">Photos ({photoCount ?? 0})</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="flex-col h-auto py-3 gap-1">
          <Link href={`/reunion/${id}/surveys`}>
            <ClipboardList className="h-5 w-5" />
            <span className="text-xs">Surveys ({surveyCount ?? 0})</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="flex-col h-auto py-3 gap-1">
          <Link href={`/reunion/${id}/timeline`}>
            <ListChecks className="h-5 w-5" />
            <span className="text-xs">Timeline</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="flex-col h-auto py-3 gap-1">
          <Link href={`/reunion/${id}/budget-estimator`}>
            <Wallet className="h-5 w-5" />
            <span className="text-xs">Budget Estimator</span>
          </Link>
        </Button>
        {canManage && (
          <Button asChild variant="outline" className="flex-col h-auto py-3 gap-1">
            <Link href={`/reunion/${id}/budget`}>
              <DollarSign className="h-5 w-5" />
              <span className="text-xs">Payments</span>
            </Link>
          </Button>
        )}
        {canManage && (
          <Button asChild variant="outline" className="flex-col h-auto py-3 gap-1">
            <Link href={`/reunion/${id}/report`}>
              <FileText className="h-5 w-5" />
              <span className="text-xs">Report</span>
            </Link>
          </Button>
        )}
        {canManage && (
          <Button asChild variant="outline" className="flex-col h-auto py-3 gap-1">
            <Link href={`/reunion/${id}/manage`}>
              <Settings className="h-5 w-5" />
              <span className="text-xs">Manage</span>
            </Link>
          </Button>
        )}
      </div>

      {/* Post announcement form (committee/admin) */}
      {canManage && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <AnnouncementForm reunionId={id} memberCount={memberCount ?? 0} />
          </CardContent>
        </Card>
      )}

      {/* Announcements feed */}
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 font-semibold text-lg">
          Announcements
          {unreadPosts > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-medium text-white">
              {unreadPosts} new
            </span>
          )}
        </h2>
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
