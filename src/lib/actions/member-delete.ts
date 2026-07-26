'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin(): Promise<{ id: string }> {
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

  if (!member || member.role !== 'admin') throw new Error('Admin access required')
  return { id: member.id }
}

export type DeletionPreview = {
  id: string
  name: string
  email: string
  hasLogin: boolean
  /** Rows that will be destroyed along with the profile. */
  losses: { label: string; count: number }[]
  amountOwed: number
  amountPaid: number
  warnings: string[]
  blockers: string[]
}

/** Read-only description of what deleting this member would destroy. */
export async function previewMemberDeletion(memberId: string): Promise<DeletionPreview> {
  const actor = await requireAdmin()
  const service = createServiceClient()

  const { data: member, error } = await service
    .from('members')
    .select('id, name, email, role, auth_user_id')
    .eq('id', memberId)
    .single()
  if (error || !member) throw new Error('That member no longer exists.')

  const countFor = async (table: string, column: string): Promise<number> => {
    const { count } = await service
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, memberId)
    return count ?? 0
  }

  const [signups, surveyResponses, invitations, relOut, relIn] = await Promise.all([
    countFor('signups', 'member_id'),
    countFor('survey_responses', 'member_id'),
    countFor('invitations', 'member_id'),
    countFor('relationships', 'member_id'),
    countFor('relationships', 'related_member_id'),
  ])

  const { data: balanceRows } = await service
    .from('balances')
    .select('amount_owed, amount_paid')
    .eq('member_id', memberId)

  const balances = (balanceRows ?? []) as { amount_owed: number; amount_paid: number }[]
  const amountOwed = balances.reduce((sum, b) => sum + Number(b.amount_owed ?? 0), 0)
  const amountPaid = balances.reduce((sum, b) => sum + Number(b.amount_paid ?? 0), 0)

  const losses = [
    { label: 'Event signups', count: signups },
    { label: 'Balance records', count: balances.length },
    { label: 'Family relationships', count: relOut + relIn },
    { label: 'Survey responses', count: surveyResponses },
    { label: 'Invitations', count: invitations },
  ].filter((l) => l.count > 0)

  const warnings: string[] = []
  const blockers: string[] = []

  if (member.id === actor.id) {
    blockers.push('You cannot delete your own profile.')
  }
  if (amountPaid > 0) {
    warnings.push(
      `This person has $${amountPaid.toFixed(2)} recorded as paid. Deleting them destroys that payment record — reconcile it against Stripe first if you need the history.`
    )
  }
  if (relOut + relIn > 0) {
    warnings.push(
      `${relOut + relIn} family relationship${relOut + relIn === 1 ? '' : 's'} will be removed, so they will disappear from the family tree and may leave relatives disconnected.`
    )
  }
  if (member.auth_user_id) {
    warnings.push(
      'Their login will be permanently revoked. They would need a fresh invite code to come back.'
    )
  }
  if (member.role === 'admin') {
    warnings.push('This person is an admin.')
  }

  return {
    id: member.id,
    name: member.name,
    email: member.email,
    hasLogin: !!member.auth_user_id,
    losses,
    amountOwed,
    amountPaid,
    warnings,
    blockers,
  }
}

export type DeletionOutcome = {
  name: string
  email: string
  losses: { label: string; count: number }[]
  loginRevoked: boolean
  /** Set when the profile went but the login could not be removed. */
  loginWarning: string | null
}

/**
 * Permanently deletes a member.
 *
 * The row work happens in the delete_member Postgres function so it is one
 * transaction and so the photo-tag cleanup — a uuid[] with no foreign key —
 * cannot be forgotten. Revoking the login is a separate call to the Auth admin
 * API, which has no transaction to join; it runs last so a failure there leaves
 * an unusable account rather than a deleted profile that can still sign in.
 */
export async function deleteMember(
  memberId: string,
  confirmName: string
): Promise<DeletionOutcome> {
  await requireAdmin()

  const supabase = await createClient()
  const service = createServiceClient()

  const { data: member } = await service
    .from('members')
    .select('name')
    .eq('id', memberId)
    .single()
  if (!member) throw new Error('That member no longer exists.')

  // Guards against a mis-click on the wrong row in a long directory.
  if (confirmName.trim().toLowerCase() !== member.name.trim().toLowerCase()) {
    throw new Error(`Type "${member.name}" exactly to confirm.`)
  }

  const { data, error } = await supabase.rpc('delete_member', { p_member: memberId })
  if (error) throw new Error(error.message)

  const report = (data ?? {}) as Record<string, unknown>

  const losses = [
    { label: 'Event signups', count: Number(report.signups ?? 0) },
    { label: 'Balance records', count: Number(report.balances ?? 0) },
    { label: 'Family relationships', count: Number(report.relationships ?? 0) },
    { label: 'Survey responses', count: Number(report.survey_responses ?? 0) },
    { label: 'Invitations', count: Number(report.invitations ?? 0) },
    { label: 'Photos untagged', count: Number(report.photos_untagged ?? 0) },
  ].filter((l) => l.count > 0)

  let loginRevoked = false
  let loginWarning: string | null = null
  const authUserId = report.auth_user_id

  if (typeof authUserId === 'string' && authUserId) {
    const { error: authError } = await service.auth.admin.deleteUser(authUserId)
    if (authError) {
      loginWarning = `The profile was deleted, but their login could not be removed (${authError.message}). They can still sign in, though they will land on an error page with no profile.`
    } else {
      loginRevoked = true
    }
  }

  revalidatePath('/directory')
  revalidatePath('/family-tree')
  revalidatePath('/admin/members')

  return {
    name: String(report.deleted_name ?? member.name),
    email: String(report.deleted_email ?? ''),
    losses,
    loginRevoked,
    loginWarning,
  }
}
