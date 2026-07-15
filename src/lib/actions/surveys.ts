'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type SurveyQuestion = {
  question: string
  type: 'free_text' | 'multiple_choice'
  options?: string[]
}

export async function createSurvey(
  reunionId: string,
  title: string,
  questions: SurveyQuestion[]
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await supabase
    .from('members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member || !['committee', 'admin'].includes(member.role)) {
    throw new Error('Committee access required')
  }

  const { data, error } = await supabase
    .from('surveys')
    .insert({
      reunion_id: reunionId,
      title,
      questions,
      created_by: member.id,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}/surveys`)
  return data.id
}

export async function submitSurveyResponse(
  surveyId: string,
  reunionId: string,
  answers: Record<number, string>
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) throw new Error('Member not found')

  const { error } = await supabase.from('survey_responses').upsert(
    {
      survey_id: surveyId,
      member_id: member.id,
      answers,
    },
    { onConflict: 'survey_id,member_id' }
  )

  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}/surveys/${surveyId}`)
}
