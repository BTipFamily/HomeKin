import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import SurveyBuilder from './survey-builder'

interface NewSurveyPageProps {
  params: Promise<{ id: string }>
}

export default async function NewSurveyPage({ params }: NewSurveyPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member || !['committee', 'admin'].includes(member.role)) redirect(`/reunion/${id}/surveys`)

  const { data: reunion } = await supabase
    .from('reunions')
    .select('id, name')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/reunion/${id}/surveys`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Surveys
        </Link>
      </Button>
      <h1 className="mb-6 text-2xl font-bold">New Survey</h1>
      <SurveyBuilder reunionId={id} />
    </div>
  )
}
