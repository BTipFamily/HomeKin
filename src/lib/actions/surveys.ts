'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  pruneHiddenAnswers,
  validateSurveyAnswers,
  validateSurveyDefinition,
  type SurveyAnswers,
  type SurveyQuestion,
} from '@/lib/surveys'

// The shape and its rules live in lib/surveys.ts so both this action and the
// form can use them; re-exported here because every survey component already
// imports the type from this module.
export type { SurveyQuestion, SurveyAnswers }

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

  // Checked here as well as in the builder. The builder's copy is what someone
  // reads; this is what stops a malformed survey reaching the column, which has
  // no shape constraint of its own.
  const problems = validateSurveyDefinition(title, questions)
  if (problems.length > 0) throw new Error(problems.join(' '))

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
  answers: SurveyAnswers
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

  // The survey is re-read rather than trusted from the caller: which questions
  // are required, and which are only asked in some cases, are facts about the
  // survey, and a form can be made to say anything.
  const { data: survey } = await supabase
    .from('surveys')
    .select('questions')
    .eq('id', surveyId)
    .eq('reunion_id', reunionId)
    .single()
  if (!survey) throw new Error('That survey no longer exists.')

  const questions: SurveyQuestion[] = Array.isArray(survey.questions) ? survey.questions : []

  // Prune before validating, so an answer to a question that is not being asked
  // can never satisfy a requirement — or be stored.
  const kept = pruneHiddenAnswers(questions, answers)
  const problems = validateSurveyAnswers(questions, kept)
  if (problems.length > 0) throw new Error(problems.join(' '))

  const { error } = await supabase.from('survey_responses').upsert(
    {
      survey_id: surveyId,
      member_id: member.id,
      answers: kept,
    },
    { onConflict: 'survey_id,member_id' }
  )

  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}/surveys/${surveyId}`)
}
