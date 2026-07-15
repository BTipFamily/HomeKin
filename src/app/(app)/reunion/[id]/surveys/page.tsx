import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, ClipboardList, Plus, CheckCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface SurveysPageProps {
  params: Promise<{ id: string }>
}

export default async function SurveysPage({ params }: SurveysPageProps) {
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
    .select('id, name')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  const { data: surveys } = await supabase
    .from('surveys')
    .select('*, created_by_member:created_by(name)')
    .eq('reunion_id', id)
    .order('created_at', { ascending: false })

  // Check which surveys this member has responded to
  const { data: myResponses } = await supabase
    .from('survey_responses')
    .select('survey_id')
    .eq('member_id', member.id)

  const respondedSet = new Set(myResponses?.map((r) => r.survey_id) ?? [])
  const canManage = ['committee', 'admin'].includes(member.role)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/reunion/${id}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {reunion.name}
        </Link>
      </Button>

      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Surveys</h1>
        {canManage && (
          <Button asChild size="sm">
            <Link href={`/reunion/${id}/surveys/new`}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Survey
            </Link>
          </Button>
        )}
      </div>

      {(!surveys || surveys.length === 0) ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p>No surveys yet.</p>
          {canManage && (
            <Button asChild className="mt-4" size="sm">
              <Link href={`/reunion/${id}/surveys/new`}>Create a survey</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {surveys.map((survey) => {
            const hasResponded = respondedSet.has(survey.id)
            const questionCount = Array.isArray(survey.questions) ? survey.questions.length : 0
            return (
              <Card key={survey.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{survey.title}</p>
                        {hasResponded && (
                          <Badge className="bg-green-500/10 text-green-700 border-green-200">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Responded
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {questionCount} question{questionCount !== 1 ? 's' : ''} ·{' '}
                        {formatDate(survey.created_at)}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/reunion/${id}/surveys/${survey.id}`}>
                        {hasResponded ? (canManage ? 'Results' : 'View') : 'Respond'}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
