import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, BarChart3 } from 'lucide-react'
import type { SurveyQuestion } from '@/lib/actions/surveys'
import { SurveyResponseForm } from './survey-response-form'

interface SurveyPageProps {
  params: Promise<{ id: string; surveyId: string }>
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

  const canManage = ['committee', 'admin'].includes(member.role)

  // Committee: load all responses for results
  let allResponses: any[] = []
  let responseCount = 0
  if (canManage) {
    const { data } = await supabase
      .from('survey_responses')
      .select('answers, member:member_id(name)')
      .eq('survey_id', surveyId)
    allResponses = data ?? []
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

      <div className="mb-6">
        <h1 className="text-2xl font-bold">{survey.title}</h1>
        {canManage && (
          <p className="mt-1 text-sm text-muted-foreground">{responseCount} response{responseCount !== 1 ? 's' : ''}</p>
        )}
      </div>

      {/* Response form — show if member hasn't responded, or always for committee */}
      {(!myResponse || canManage) && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">
              {myResponse ? 'Your Response (already submitted)' : 'Your Response'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myResponse ? (
              <div className="space-y-4">
                {questions.map((q, qi) => (
                  <div key={qi}>
                    <p className="text-sm font-medium">{q.question}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {(myResponse.answers as any)[qi] ?? '—'}
                    </p>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">You've already responded to this survey.</p>
              </div>
            ) : (
              <SurveyResponseForm
                surveyId={surveyId}
                reunionId={id}
                questions={questions}
              />
            )}
          </CardContent>
        </Card>
      )}

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
              const answers = allResponses.map((r) => (r.answers as any)[qi] ?? '')
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
                      {answers.filter(Boolean).map((a, i) => {
                        const respondent = allResponses[i]?.member?.name
                        return (
                          <div key={i} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                            <p>{a}</p>
                            {respondent && (
                              <p className="text-xs text-muted-foreground mt-0.5">— {respondent}</p>
                            )}
                          </div>
                        )
                      })}
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
