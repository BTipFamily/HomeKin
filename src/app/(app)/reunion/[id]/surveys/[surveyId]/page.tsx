import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, BarChart3, Trash2 } from 'lucide-react'
import { describeSurveyLoss, type SurveyAnswers, type SurveyQuestion } from '@/lib/surveys'
import { deleteSurvey } from '@/lib/actions/surveys'
import { ActionButton } from '@/components/action-button'
import { SurveyResponseForm } from './survey-response-form'

interface SurveyPageProps {
  params: Promise<{ id: string; surveyId: string }>
}

/**
 * One answer out of a stored response.
 *
 * `answers` is jsonb with no shape constraint, so it is read rather than
 * trusted — and since hidden questions are pruned instead of blanked, a missing
 * key means "not asked", not "corrupt row".
 */
function readAnswer(answers: unknown, index: number): string {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return ''
  const value = (answers as Record<string, unknown>)[String(index)]
  return typeof value === 'string' ? value : ''
}

export default async function SurveyDetailPage({ params }: SurveyPageProps) {
  const { id, surveyId } = await params
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
    .select('id, name')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  const { data: survey } = await supabase
    .from('surveys')
    .select('*')
    .eq('id', surveyId)
    .eq('reunion_id', id)
    .single()
  if (!survey) notFound()

  const questions: SurveyQuestion[] = Array.isArray(survey.questions) ? survey.questions : []

  const { data: myResponse } = await supabase
    .from('survey_responses')
    .select('answers')
    .eq('survey_id', surveyId)
    .eq('member_id', member.id)
    .maybeSingle()

  // Read defensively. `answers` is jsonb with no shape constraint, and since
  // hidden questions are now pruned rather than blanked, a key being absent is
  // normal rather than a sign something is wrong.
  const existingAnswers: SurveyAnswers | undefined =
    myResponse?.answers && typeof myResponse.answers === 'object' && !Array.isArray(myResponse.answers)
      ? (myResponse.answers as SurveyAnswers)
      : undefined

  const canManage = ['committee', 'admin'].includes(member.role)

  // Committee: load all responses for results. Normalised on the way in —
  // an embedded row comes back as an array or an object depending on how the
  // relationship is inferred, and the rest of the page should not care.
  let allResponses: { answers: unknown; memberName: string | null }[] = []
  let responseCount = 0
  if (canManage) {
    const { data } = await supabase
      .from('survey_responses')
      .select('answers, member:member_id(name)')
      .eq('survey_id', surveyId)

    allResponses = (data ?? []).map((row) => {
      const embedded = row.member as { name?: string } | { name?: string }[] | null
      const one = Array.isArray(embedded) ? embedded[0] : embedded
      return { answers: row.answers, memberName: one?.name ?? null }
    })
    responseCount = allResponses.length
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/reunion/${id}/surveys`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Surveys
        </Link>
      </Button>

      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{survey.title}</h1>
          {canManage && (
            <p className="mt-1 text-sm text-muted-foreground">{responseCount} response{responseCount !== 1 ? 's' : ''}</p>
          )}
        </div>
        {canManage && (
          <div className="flex flex-col items-end gap-1">
            <ActionButton
              action={deleteSurvey.bind(null, surveyId, id)}
              label={`Remove survey: ${survey.title}`}
              variant="outline"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-destructive"
              confirm={describeSurveyLoss(survey.title, responseCount)}
              messageClassName="w-52 text-right"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </ActionButton>
          </div>
        )}
      </div>

      {/* Everyone gets the form, whatever their role and whether or not they have
          answered before. It used to be hidden once a response existed unless you
          were on the committee, which left a plain member looking at an empty
          card with no way back in — and made it look like they lacked permission
          to answer at all. */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Your Response</CardTitle>
          {existingAnswers && (
            <p className="text-sm text-muted-foreground">
              You have already answered this one. Change anything you like and save again — your
              new answers replace the old ones.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <SurveyResponseForm
            surveyId={surveyId}
            reunionId={id}
            questions={questions}
            initialAnswers={existingAnswers}
          />
        </CardContent>
      </Card>

      {/* Committee: results aggregation */}
      {canManage && allResponses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Results ({responseCount} responses)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {questions.map((q, qi) => {
              // A key being absent is normal: answers to questions somebody was
              // never asked are pruned rather than stored blank.
              //
              // The name travels with the answer rather than being looked up by
              // position later. Filtering the answers first and then indexing
              // back into the response list put somebody else's name under a
              // quote as soon as one person had skipped the question — and
              // pruning makes skipped questions the common case.
              const answered = allResponses
                .map((r) => ({ text: readAnswer(r.answers, qi), who: r.memberName }))
                .filter((a) => a.text !== '')
              const answers = allResponses.map((r) => readAnswer(r.answers, qi))
              const isMC = q.type === 'multiple_choice' && q.options

              return (
                <div key={qi}>
                  <p className="text-sm font-medium mb-2">{qi + 1}. {q.question}</p>
                  {isMC ? (
                    <div className="space-y-1.5">
                      {(q.options ?? []).filter(Boolean).map((opt) => {
                        const count = answers.filter((a) => a === opt).length
                        const pct = responseCount > 0 ? Math.round((count / responseCount) * 100) : 0
                        return (
                          <div key={opt}>
                            <div className="flex items-center justify-between text-sm mb-0.5">
                              <span>{opt}</span>
                              <span className="text-muted-foreground">{count} ({pct}%)</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {answered.map((a, i) => (
                        <div key={i} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                          <p>{a.text}</p>
                          {a.who && (
                            <p className="text-xs text-muted-foreground mt-0.5">— {a.who}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
