'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { actionError, actionSuccess, failedWith, type ActionState } from '@/lib/action-state'
import { isReportReason, isReportableType, validateReport } from '@/lib/moderation'

/**
 * Reporting content, and blocking a person.
 *
 * Every action here returns its failure rather than throwing it. That matters
 * more on this screen than anywhere else in the app: somebody reporting a
 * photograph that upset them, and being shown Next's redacted error, has been
 * told their complaint went nowhere.
 */

async function myMemberId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  return member?.id ?? null
}

async function myRole(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: member } = await supabase
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  return member?.role ?? null
}

async function applyReport(formData: FormData) {
  const memberId = await myMemberId()
  if (!memberId) throw new Error('You are not signed in.')

  const contentType = formData.get('content_type')
  const contentId = ((formData.get('content_id') as string) ?? '').trim()
  const reason = formData.get('reason')
  const detail = ((formData.get('detail') as string) ?? '').trim()
  const reunionId = ((formData.get('reunion_id') as string) ?? '').trim() || null

  if (!isReportableType(contentType)) throw new Error('That is not something that can be reported.')
  if (!contentId) throw new Error('That report is missing what it refers to.')
  if (!isReportReason(reason)) throw new Error('Choose what is wrong with it.')

  const problems = validateReport({ reason, detail })
  if (problems.length > 0) throw new Error(problems.join(' '))

  const supabase = await createClient()

  // Upsert on the unique (reporter, type, id): pressing report twice is the
  // same complaint, not two, and should not put a duplicate in the queue.
  const { error } = await supabase.from('content_reports').upsert(
    {
      reporter_id: memberId,
      content_type: contentType,
      content_id: contentId,
      reunion_id: reunionId,
      reason,
      detail: detail || null,
    },
    { onConflict: 'reporter_id,content_type,content_id' }
  )

  if (error) throw new Error(error.message)

  revalidatePath('/admin/reports')
}

/** Reporting a photo, comment, message, announcement or profile. */
export async function reportContent(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await applyReport(formData)
  } catch (e) {
    return failedWith(e, 'That report could not be sent.')
  }
  return actionSuccess(
    'Reported. The committee will look at it — thank you for saying something.'
  )
}

async function applyBlock(memberId: string) {
  const me = await myMemberId()
  if (!me) throw new Error('You are not signed in.')
  if (me === memberId) throw new Error('You cannot block yourself.')

  const supabase = await createClient()
  const { error } = await supabase
    .from('member_blocks')
    .upsert({ blocker_id: me, blocked_id: memberId }, { onConflict: 'blocker_id,blocked_id' })

  if (error) throw new Error(error.message)

  // Blocking changes what is visible almost everywhere, and the restrictive
  // policies in migration 035 do the hiding — but cached pages would keep
  // showing it until something invalidated them.
  revalidatePath('/', 'layout')
}

/** Blocking somebody. Hides them from you and you from them, both ways. */
export async function blockMember(
  memberId: string,
  _prevState: ActionState
): Promise<ActionState> {
  try {
    await applyBlock(memberId)
  } catch (e) {
    return failedWith(e, 'That person could not be blocked.')
  }
  return actionSuccess('Blocked. You will not see each other in the app.')
}

async function applyUnblock(memberId: string) {
  const me = await myMemberId()
  if (!me) throw new Error('You are not signed in.')

  const supabase = await createClient()
  const { error } = await supabase
    .from('member_blocks')
    .delete()
    .eq('blocker_id', me)
    .eq('blocked_id', memberId)

  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
}

/** Lifting a block. */
export async function unblockMember(
  memberId: string,
  _prevState: ActionState
): Promise<ActionState> {
  try {
    await applyUnblock(memberId)
  } catch (e) {
    return failedWith(e, 'That block could not be lifted.')
  }
  return actionSuccess('Unblocked.')
}

async function applyResolveReport(reportId: string, status: 'actioned' | 'dismissed', note: string) {
  const role = await myRole()
  if (!role) throw new Error('You are not signed in.')
  if (!['committee', 'admin'].includes(role)) {
    throw new Error('Committee or admin access is needed to resolve a report.')
  }

  const me = await myMemberId()
  const supabase = await createClient()

  const { data: updated, error } = await supabase
    .from('content_reports')
    .update({
      status,
      reviewed_by: me,
      reviewed_at: new Date().toISOString(),
      review_note: note.trim() || null,
    })
    .eq('id', reportId)
    .select('id')

  if (error) throw new Error(error.message)

  // Zero rows and no error is how RLS refuses an update. The role check above
  // has already passed, so the likely cause is migration 035 not being applied.
  if (!updated || updated.length === 0) {
    throw new Error(
      'Nothing was updated. Either that report is already gone, or the policies in migration ' +
        '035_reports_and_blocks.sql have not been applied yet — ask an admin to check.'
    )
  }

  revalidatePath('/admin/reports')
}

/**
 * Committee closing a report, either way.
 *
 * Takes everything from the form rather than from bound arguments so the note
 * and the decision can travel together in one submission. Binding the status
 * would need a form per button, and a form per button cannot share the note
 * field — nesting forms is invalid HTML, and the alternative is losing what the
 * reviewer typed.
 */
export async function resolveReport(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const reportId = ((formData.get('report_id') as string) ?? '').trim()
  const status = formData.get('status')
  const note = ((formData.get('review_note') as string) ?? '').trim()

  if (!reportId) return actionError('That report could not be identified.')
  if (status !== 'actioned' && status !== 'dismissed') {
    return actionError('That is not a way a report can be closed.')
  }

  try {
    await applyResolveReport(reportId, status, note)
  } catch (e) {
    return failedWith(e, 'That report could not be updated.')
  }
  return actionSuccess(status === 'actioned' ? 'Marked as dealt with.' : 'Dismissed.')
}
