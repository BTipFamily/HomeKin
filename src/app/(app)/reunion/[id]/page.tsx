import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowRight,
  Pin,
  Trash2,
  Calendar,
  Camera,
  Users,
  MessageCircle,
  ClipboardList,
  DollarSign,
  ListChecks,
  MapPin,
  Wallet,
  Settings,
  FileText,
  HeartHandshake,
  CalendarDays,
  Compass,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { summarizeBalances } from '@/lib/balance-summary'
import { formatDateRange, hubHero } from '@/lib/reunion-hub'
import {
  REUNION_PHASES,
  nextPhase,
  phaseCopy,
  phaseIndex,
  type ReunionPhase,
} from '@/lib/reunion-phase'
import { setReunionPhase } from '@/lib/actions/reunions'
import { deleteAnnouncement } from '@/lib/actions/announcements'
import { ActionButton } from '@/components/action-button'
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

  // What the hero leads with: whether they have answered the interest form, and
  // what they still owe. Both are this member's own rows, so RLS is no obstacle.
  const { data: myInterest } = await supabase
    .from('interest_responses')
    .select('id')
    .eq('reunion_id', id)
    .eq('member_id', member.id)
    .maybeSingle()

  const { data: myBalances } = await supabase
    .from('balances')
    .select('sub_event_id, amount_owed, amount_paid, status')
    .eq('reunion_id', id)
    .eq('member_id', member.id)

  const phase = reunion.status as ReunionPhase
  const { outstanding } = summarizeBalances(myBalances ?? [])
  const hero = hubHero({
    phase,
    canManage,
    hasAnsweredInterest: Boolean(myInterest),
    outstanding,
  })
  const next = nextPhase(phase)
  const dates = formatDateRange(reunion.start_date, reunion.end_date)

  // Two groups rather than one grid of thirteen: what the family comes here for,
  // and the tools the committee plans with. Timeline and the estimator are open
  // to everyone read-only, so they sit with planning for members too.
  const familyTiles: Tile[] = [
    { path: 'events', label: `Events (${eventCount ?? 0})`, icon: Calendar },
    { path: 'signups', label: 'Signups & Pay', icon: Users },
    { path: 'agenda', label: 'Agenda', icon: CalendarDays },
    { path: 'chat', label: 'Chat', icon: MessageCircle, badge: unreadChat },
    { path: 'photos', label: `Photos (${photoCount ?? 0})`, icon: Camera },
    { path: 'surveys', label: `Surveys (${surveyCount ?? 0})`, icon: ClipboardList },
    { path: 'interest', label: 'Interest', icon: HeartHandshake },
  ]
  const planningTiles: Tile[] = [
    ...(canManage ? [{ path: 'planning', label: 'Planning', icon: Compass }] : []),
    { path: 'timeline', label: 'Timeline', icon: ListChecks },
    { path: 'budget-estimator', label: 'Budget Estimator', icon: Wallet },
    ...(canManage
      ? [
          { path: 'budget', label: 'Payments', icon: DollarSign },
          { path: 'report', label: 'Report', icon: FileText },
          { path: 'manage', label: 'Manage', icon: Settings },
        ]
      : []),
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Reunion header — when and where come first, because that is the first
          thing anyone asks about a reunion. */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{reunion.name}</h1>
        {(dates || reunion.location_name) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {dates && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" aria-hidden />
                {dates}
              </span>
            )}
            {reunion.location_name && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {reunion.location_name}
              </span>
            )}
          </p>
        )}
        {reunion.description && (
          <p className="mt-2 text-muted-foreground">{reunion.description}</p>
        )}
      </div>

      {/* Hero: the one thing this person is most likely here to do. */}
      <Card className="mb-8 border-primary/30 bg-primary/5">
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{hero.phaseLabel}</Badge>
            <span className="text-xs text-muted-foreground">
              Stage {phaseIndex(phase) + 1} of {REUNION_PHASES.length}
            </span>
          </div>
          <p className="mt-3 text-base font-medium">{hero.summary}</p>
          {(hero.primary || hero.secondary) && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {hero.primary && (
                <Button asChild size="lg">
                  <Link href={hubHref(id, hero.primary.path)}>
                    {hero.primary.label}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              )}
              {hero.secondary && (
                <Button asChild variant="outline">
                  <Link href={hubHref(id, hero.secondary.path)}>{hero.secondary.label}</Link>
                </Button>
              )}
            </div>
          )}
          {canManage && next && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-primary/20 pt-3 text-sm text-muted-foreground">
              <span>Ready for the next stage?</span>
              <ActionButton
                action={setReunionPhase.bind(null, id, next)}
                label={`Move to ${phaseCopy(next).label}`}
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-primary"
                confirm={`Move this reunion to “${phaseCopy(next).label}”? The family will see: ${phaseCopy(next).memberSummary} You can change it back from Manage.`}
              >
                Move to {phaseCopy(next).label}
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </ActionButton>
            </div>
          )}
        </CardContent>
      </Card>

      <TileGroup reunionId={id} title="Your reunion" tiles={familyTiles} />
      <TileGroup
        reunionId={id}
        title={canManage ? 'Committee tools' : 'Planning'}
        description={canManage ? undefined : 'What the committee is working from.'}
        tiles={planningTiles}
        muted
      />

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
                    <ActionButton
                      action={deleteAnnouncement.bind(null, a.id, id)}
                      label={`Delete announcement: ${a.title}`}
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      confirm="Delete this announcement? It cannot unsend an email already gone out."
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </ActionButton>
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

type Tile = { path: string; label: string; icon: LucideIcon; badge?: number }

function hubHref(reunionId: string, path: string): string {
  return path ? `/reunion/${reunionId}/${path}` : `/reunion/${reunionId}`
}

/**
 * One labelled group of section links. `muted` sets the committee's tools apart
 * from the family's, so nobody has to read every label to find what is theirs.
 */
function TileGroup({
  reunionId,
  title,
  description,
  tiles,
  muted = false,
}: {
  reunionId: string
  title: string
  description?: string
  tiles: Tile[]
  muted?: boolean
}) {
  if (tiles.length === 0) return null
  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(({ path, label, icon: Icon, badge }) => (
          <Button
            key={path}
            asChild
            variant="outline"
            className={cn('h-auto flex-col gap-1.5 py-4', muted && 'bg-muted/40')}
          >
            <Link href={hubHref(reunionId, path)} className="relative">
              <Icon className="h-5 w-5" aria-hidden />
              <span className="text-sm">{label}</span>
              {badge ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                  <span className="sr-only">Unread: </span>
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </Link>
          </Button>
        ))}
      </div>
    </section>
  )
}
