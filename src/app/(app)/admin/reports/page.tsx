import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Flag, ShieldCheck } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { ResolveReport } from './resolve-report'
import {
  describeReport,
  REPORTABLE_TYPE_LABELS,
  type ReportableType,
  type ReportReason,
} from '@/lib/moderation'
import { MODERATION_RESPONSE_HOURS } from '@/lib/legal'

/**
 * The queue that makes the promise in the Terms true.
 *
 * App Store guideline 1.2 asks an app carrying user content for three things: a
 * way to report, a way to block, and somebody who acts. This is the third. A
 * report form with nothing behind it is worse than none, because it tells people
 * their complaint was received.
 */
export default async function ReportsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!me || !['committee', 'admin'].includes(me.role)) redirect('/dashboard')

  const { data: reports } = await supabase
    .from('content_reports')
    .select(
      'id, content_type, content_id, reunion_id, reason, detail, status, created_at, review_note, reporter:reporter_id(name), reviewer:reviewed_by(name)'
    )
    .order('status')
    .order('created_at', { ascending: false })

  const rows = (reports ?? []).map((r) => {
    const reporter = Array.isArray(r.reporter) ? r.reporter[0] : r.reporter
    const reviewer = Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer
    return {
      ...r,
      reporterName: (reporter as { name?: string } | null)?.name ?? null,
      reviewerName: (reviewer as { name?: string } | null)?.name ?? null,
    }
  })

  const open = rows.filter((r) => r.status === 'open')
  const closed = rows.filter((r) => r.status !== 'open')

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/admin">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Admin
        </Link>
      </Button>

      <div className="mb-2 flex items-center gap-2">
        <Flag className="h-5 w-5" />
        <h1 className="text-2xl font-bold">Reported content</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        The Terms promise the family that these are looked at within{' '}
        {MODERATION_RESPONSE_HOURS} hours. Open the item, decide, and close the report either way —
        dismissing one is a real answer, and leaving it open is not.
      </p>

      {open.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p>Nothing waiting.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {open.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Already dealt with ({closed.length})
          </h2>
          <div className="space-y-2">
            {closed.map((r) => (
              <Card key={r.id} className="opacity-70">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span>
                    {describeReport({
                      reason: r.reason as ReportReason,
                      contentType: r.content_type as ReportableType,
                      reporterName: r.reporterName,
                    })}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={r.status === 'actioned' ? 'default' : 'secondary'}>
                      {r.status === 'actioned' ? 'Dealt with' : 'Dismissed'}
                    </Badge>
                    {r.reviewerName && (
                      <span className="text-xs text-muted-foreground">by {r.reviewerName}</span>
                    )}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

type ReportRow = {
  id: string
  content_type: string
  content_id: string
  reunion_id: string | null
  reason: string
  detail: string | null
  created_at: string
  reporterName: string | null
}

function ReportCard({ report }: { report: ReportRow }) {
  const contentType = report.content_type as ReportableType

  // Where a committee member goes to see the thing itself. Photos and comments
  // both live on the album page; a profile is its own route. There is
  // deliberately no deep link into a direct message — nobody, committee
  // included, gets to read somebody's private messages from a queue.
  const link =
    contentType === 'member'
      ? `/directory/${report.content_id}`
      : report.reunion_id
        ? contentType === 'photo' || contentType === 'photo_comment'
          ? `/reunion/${report.reunion_id}/photos`
          : contentType === 'message'
            ? `/reunion/${report.reunion_id}/chat`
            : `/reunion/${report.reunion_id}`
        : null

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">
              {describeReport({
                reason: report.reason as ReportReason,
                contentType,
                reporterName: report.reporterName,
              })}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(report.created_at)}</p>
          </div>
          {link ? (
            <Button asChild size="sm" variant="outline">
              <Link href={link}>Open the {REPORTABLE_TYPE_LABELS[contentType]}</Link>
            </Button>
          ) : (
            <Badge variant="outline">Private message</Badge>
          )}
        </div>

        {report.detail && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">{report.detail}</p>
        )}

        <ResolveReport reportId={report.id} />
      </CardContent>
    </Card>
  )
}
