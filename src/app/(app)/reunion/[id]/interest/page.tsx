import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import { phaseCopy, type ReunionPhase } from '@/lib/reunion-phase'
import { summarizeInterest, type InterestResponse } from '@/lib/interest-summary'
import type { InterestDraft } from '@/lib/actions/interest'
import { InterestForm } from './interest-form'
import { InterestSummaryView } from './interest-summary-view'

interface InterestPageProps {
  params: Promise<{ id: string }>
}

export default async function InterestPage({ params }: InterestPageProps) {
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
    .select('id, name, status')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  const isCommittee = ['committee', 'admin'].includes(member.role)

  // RLS returns only this member's row for an ordinary member and everything
  // for the committee, so one query serves both and neither can see more than
  // it should by asking differently.
  const { data: responses } = await supabase
    .from('interest_responses')
    .select('*, member:member_id(id, name), ranges:interest_date_ranges(starts_on, ends_on)')
    .eq('reunion_id', id)

  const all = (responses ?? []) as unknown as (InterestResponse & {
    member?: { id: string; name: string } | null
  })[]

  const mine = all.find((r) => r.member_id === member.id) ?? null

  const initial: InterestDraft | null = mine
    ? {
        attending: mine.attending,
        adults: mine.adults,
        youth: mine.youth,
        children: mine.children,
        preferred_months: mine.preferred_months ?? [],
        preferred_length: mine.preferred_length,
        budget_band: mine.budget_band,
        lodging_need: mine.lodging_need,
        willing_to_volunteer: mine.willing_to_volunteer,
        volunteer_areas: mine.volunteer_areas ?? [],
        history_interest: mine.history_interest,
        date_ranges: (
          (mine as unknown as { ranges?: { starts_on: string; ends_on: string }[] }).ranges ?? []
        ).map((r) => ({ starts_on: r.starts_on, ends_on: r.ends_on })),
        suggested_locations: (mine as unknown as { suggested_locations?: string[] }).suggested_locations ?? [],
        food_preferences: (mine as unknown as { food_preferences?: string[] }).food_preferences ?? [],
        notes: mine.notes ?? '',
      }
    : null

  const copy = phaseCopy(reunion.status as ReunionPhase)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
        <Link href={`/reunion/${id}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {reunion.name}
        </Link>
      </Button>
      <h1 className="text-2xl font-bold">Are you hoping to come?</h1>
      <p className="mb-6 text-sm text-muted-foreground">{copy.memberSummary}</p>

      <Card className="mb-8">
        <CardContent className="pt-6">
          <InterestForm reunionId={id} initial={initial} />
        </CardContent>
      </Card>

      {isCommittee && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What the family has said</CardTitle>
          </CardHeader>
          <CardContent>
            {all.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No answers yet. Share the reunion link and this fills in.
              </p>
            ) : (
              <InterestSummaryView summary={summarizeInterest(all)} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
