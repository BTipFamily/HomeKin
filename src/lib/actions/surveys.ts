'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { failedWith, type ActionState } from '@/lib/action-state'
import {
  pruneHiddenAnswers,
  validateSurveyAnswers,
  validateSurveyDefinition,
  type CreateSurveyResult,
  type SurveyAnswers,
  type SurveyQuestion,
  type SurveyResponseResult,
} from '@/lib/surveys'

// This module exports async functions and nothing else. Types — including
// re-exports of them — belong in lib/surveys.ts: Next compiles a 'use server'
// file by listing its exports at runtime, and a `export type { … }` specifier
// list survives that as a bare identifier, throwing ReferenceError on module
// evaluation. See the note on SurveyResponseResult there.

/** Building a survey. Committee and admins only — members answer, they don't author. */
export async function createSurvey(
  reunionId: string,
  title: string,
  questions: SurveyQuestion[]
): Promise<CreateSurveyResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: 'blocked', message: 'You are not signed in.' }

  const { data: member } = await supabase
    .from('members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member || !['committee', 'admin'].includes(member.role)) {
    return { status: 'blocked', message: 'Committee or admin access is needed to build a survey.' }
  }

  // Checked here as well as in the builder. The builder's copy is what someone
  // reads; this is what stops a malformed survey reaching the column, which has
  // no shape constraint of its own.
  const problems = validateSurveyDefinition(title, questions)
  if (problems.length > 0) {
    return { status: 'blocked', message: 'This survey is not ready yet.', problems }
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

  if (error) return { status: 'blocked', message: error.message }

  revalidatePath(`/reunion/${reunionId}/surveys`)
  return { status: 'created', id: data.id }
}

/**
 * Postgres refusing a write because of row-level security.
 *
 * Worth naming rather than passing through: the raw message says a policy was
 * violated, which reads like the member did something wrong when in fact the
 * database is missing a policy nobody has applied yet.
 */
function isRlsRefusal(error: { code?: string; message?: string }): boolean {
  return (
    error.code === '42501' ||
    (error.message ?? '').toLowerCase().includes('row-level security')
  )
}

/**
 * Records someone's answers.
 *
 * Returns its failures rather than throwing them. A thrown Server Action gives
 * the reader Next's generic error with the reason stripped and only a digest to
 * show for it — which is exactly the report this was written in response to.
 * Anything a person could act on has to come back as a value.
 */
export async function submitSurveyResponse(
  surveyId: string,
  reunionId: string,
  answers: SurveyAnswers
): Promise<SurveyResponseResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: 'blocked', message: 'You are not signed in.' }

  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) {
    return {
      status: 'blocked',
      message: 'Your account is not linked to a profile in the directory, so there is nowhere to record an answer. Ask an admin to check your profile.',
    }
  }

  // The survey is re-read rather than trusted from the caller: which questions
  // are required, and which are only asked in some cases, are facts about the
  // survey, and a form can be made to say anything.
  const { data: survey } = await supabase
    .from('surveys')
    .select('questions')
    .eq('id', surveyId)
    .eq('reunion_id', reunionId)
    .single()
  if (!survey) {
    return { status: 'blocked', message: 'That survey no longer exists.' }
  }

  const questions: SurveyQuestion[] = Array.isArray(survey.questions) ? survey.questions : []

  // Prune before validating, so an answer to a question that is not being asked
  // can never satisfy a requirement — or be stored.
  const kept = pruneHiddenAnswers(questions, answers)
  const problems = validateSurveyAnswers(questions, kept)
  if (problems.length > 0) {
    return { status: 'blocked', message: 'Some answers are still needed.', problems }
  }

  const { error } = await supabase.from('survey_responses').upsert(
    {
      survey_id: surveyId,
      member_id: member.id,
      answers: kept,
    },
    { onConflict: 'survey_id,member_id' }
  )

  if (error) {
    if (isRlsRefusal(error)) {
      // Changing an answer is an UPDATE, and the policy allowing it arrived in
      // migration 032. A file in the repo does nothing until it is applied.
      return {
        status: 'blocked',
        message:
          'The database refused to save that. If you have answered this survey before, ' +
          'the policy that allows changing an answer is in migration ' +
          '032_survey_response_update.sql — ask an admin whether it has been applied.',
      }
    }
    return { status: 'blocked', message: error.message }
  }

  revalidatePath(`/reunion/${reunionId}/surveys/${surveyId}`)
  return { status: 'saved' }
}

/**
 * Removes a survey and, by cascade, every answer given to it.
 *
 * Committee and admin, matching who can create one. The role is checked here as
 * well as in the policy: RLS filtering a delete removes no rows and reports no
 * error, so without this check a member pressing the button would be told the
 * survey no longer exists — which is both wrong and alarming.
 */
async function applyDeleteSurvey(surveyId: string, reunionId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You are not signed in.')

  const { data: member } = await supabase
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member || !['committee', 'admin'].includes(member.role)) {
    throw new Error('Committee or admin access is needed to remove a survey.')
  }

  // Scoped by reunion as well as by id, so a survey id lifted from another
  // reunion cannot be deleted through this reunion's page.
  const { data: deleted, error } = await supabase
    .from('surveys')
    .delete()
    .eq('id', surveyId)
    .eq('reunion_id', reunionId)
    .select('id')

  if (error) throw new Error(error.message)

  // Nothing came back. The role check above has already passed, so this is
  // either a survey somebody else has just removed or — far more likely the
  // first time — the delete policy from migration 033 not being applied yet,
  // which RLS reports as zero rows and no error rather than as a refusal.
  if (!deleted || deleted.length === 0) {
    throw new Error(
      'Nothing was removed. Either that survey is already gone, or the policy that ' +
        'allows removing one is in migration 033_survey_delete.sql and has not been ' +
        'applied — ask an admin to check.'
    )
  }

  revalidatePath(`/reunion/${reunionId}/surveys`)
  revalidatePath(`/reunion/${reunionId}`)
}

/**
 * Removing a survey. Arguments are bound at the call site.
 *
 * Used from the survey list and from a survey's own page, and it redirects to
 * the list either way — from the detail page there is no longer a page to stand
 * on, and from the list the redirect just re-renders it without the card.
 */
export async function deleteSurvey(
  surveyId: string,
  reunionId: string,
  _prevState: ActionState
): Promise<ActionState> {
  try {
    await applyDeleteSurvey(surveyId, reunionId)
  } catch (e) {
    return failedWith(e, 'That survey could not be removed.')
  }
  // Outside the try: redirect signals by throwing NEXT_REDIRECT, so catching it
  // would report a successful deletion as a failure.
  redirect(`/reunion/${reunionId}/surveys`)
}
