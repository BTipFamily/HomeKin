import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Users } from 'lucide-react'
import { phaseCopy, type ReunionPhase } from '@/lib/reunion-phase'
import { summarizeInterest, type InterestResponse } from '@/lib/interest-summary'
import { bestWindows, rankSuggestions, whoIsMissing, type AvailabilityRange } from '@/lib/date-overlap'
import { PlanningDecisions } from './planning-decisions'
import { InterestSummaryView } from '../interest/interest-summary-view'

interface PlanningPageProps {
  params: Promise<{ id: string }>
}

export default async function PlanningPage({ params }: PlanningPageProps) {
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

  // The whole page is the committee's working view of what the family said.
  if (!['committee', 'admin'].includes(member.role)) redirect(`/reunion/${id}/interest`)

  const { data: reunion } = await supabase
    .from('reunions')
    .select('id, name, status, start_date, end_date, location_name')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  const { data: responses } = await supabase
    .from('interest_responses')
    .select('*, member:member_id(id, name), ranges:interest_date_ranges(starts_on, ends_on)')
    .eq('reunion_id', id)

  type Row = InterestResponse & {
    member?: { id: string; name: string } | null
    ranges?: { starts_on: string; ends_on: string }[]
    suggested_locations?: string[]
  }
  const rows = (responses ?? []) as unknown as Row[]

  // Only the families who might come get a say in when and where.
  const possible = rows.filter((r) => r.attending !== 'no')

  const availability: AvailabilityRange[] = possible.flatMap((r) =>
    (r.ranges ?? []).map((range) => ({
      responseId: r.member_id,
      memberName: r.member?.name ?? 'Someone',
      people: r.adults + r.youth + r.children,
      starts_on: range.starts_on,
      ends_on: range.ends_on,
    }))
  )

  const windows = bestWindows(availability, 2, 5)

  const suggestions = rankSuggestions(
    possible.flatMap((r) =>
      (r.suggested_locations ?? []).map((text) => ({
        text,
        people: r.adults + r.youth + r.children,
      }))
    )
  )

  const [{ data: shortlist }, { data: voteRows }] = await Promise.all([
    supabase
      .from('reunion_locations')
      .select('*')
      .eq('reunion_id', id)
      .order('created_at'),
    supabase.rpc('location_vote_counts', { p_reunion: id }),
  ])

  const votes = Object.fromEntries(
    ((voteRows ?? []) as { location_id: string; votes: number }[]).map((v) => [
      v.location_id,
      Number(v.votes),
    ])
  )

  const summary = summarizeInterest(rows)
  const copy = phaseCopy(reunion.status as ReunionPhase)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
        <Link href={`/reunion/${id}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {reunion.name}
        </Link>
      </Button>
      <h1 className="text-2xl font-bold">Planning</h1>
      <p className="mb-6 text-sm text-muted-foreground">{copy.committeeSummary}</p>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-3 h-8 w-8 opacity-30" />
            <p>Nobody has answered the interest form yet.</p>
            <p className="mt-1">
              Share{' '}
              <Link href={`/reunion/${id}/interest`} className="text-primary hover:underline">
                the interest page
              </Link>{' '}
              with the family and this fills in.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <PlanningDecisions
            reunionId={id}
            windows={windows.map((w) => ({
              ...w,
              missing: whoIsMissing(availability, { starts_on: w.starts_on, ends_on: w.ends_on }),
            }))}
            suggestions={suggestions}
            shortlist={(shortlist ?? []) as never[]}
            votes={votes}
            currentStartDate={reunion.start_date}
            currentEndDate={reunion.end_date}
            currentLocation={reunion.location_name}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">What the family said</CardTitle>
              <CardDescription>
                Headcount, lodging, budget and food across {rows.length}{' '}
                {rows.length === 1 ? 'answer' : 'answers'}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InterestSummaryView summary={summary} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
