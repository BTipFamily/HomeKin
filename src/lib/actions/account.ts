'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { AccountDeletionPreview, AccountDeletionResult } from '@/lib/account'

/**
 * Leaving.
 *
 * Separate from member-delete.ts, which is the admin's tool for removing
 * somebody else and is authorized on `requireAdmin()`. Nothing here checks a
 * role: the person deleting and the person being deleted are the same by
 * construction, and wanting to leave is not a privilege.
 *
 * Both functions here return their failures rather than throwing them, for the
 * reason the rest of this codebase now does — a thrown Server Action reaches the
 * reader as Next's redacted placeholder, and "you are the only admin, hand the
 * role over first" is the entire point of the message.
 */

async function currentMemberId(): Promise<string | null> {
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

/**
 * What deleting your account would destroy, read before anything is destroyed.
 *
 * Counted through the ordinary client, not the service role: everything totalled
 * here is the caller's own, so RLS is exactly the right filter, and using the
 * service key would mean this function could be pointed at anybody.
 */
export async function previewMyAccountDeletion(): Promise<AccountDeletionPreview> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, message: 'You are not signed in.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('id, name, email, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!member) {
    return {
      ok: false,
      message:
        'Your login is not linked to a profile in the directory, so there is no account here to delete. Ask an admin to check.',
    }
  }

  const countOwn = async (table: string): Promise<number> => {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('member_id', member.id)
    return count ?? 0
  }

  const [signups, surveyResponses, invitations] = await Promise.all([
    countOwn('signups'),
    countOwn('survey_responses'),
    countOwn('invitations'),
  ])

  const { data: relationships } = await supabase
    .from('relationships')
    .select('id')
    .or(`member_id.eq.${member.id},related_member_id.eq.${member.id}`)

  const { data: balanceRows } = await supabase
    .from('balances')
    .select('amount_owed, amount_paid')
    .eq('member_id', member.id)

  const balances = (balanceRows ?? []) as { amount_owed: number; amount_paid: number }[]
  const amountOwed = balances.reduce((sum, b) => sum + Number(b.amount_owed ?? 0), 0)
  const amountPaid = balances.reduce((sum, b) => sum + Number(b.amount_paid ?? 0), 0)

  // The last-admin refusal is enforced in the migration, where it cannot be
  // bypassed. It is repeated here only so the button can be disabled with an
  // explanation rather than failing after somebody has typed their own name.
  let blocker: string | null = null
  if (member.role === 'admin') {
    const { count } = await supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')

    if ((count ?? 0) <= 1) {
      blocker =
        'You are the only admin. Make somebody else an admin first — otherwise deleting your account would leave the family with a directory nobody can manage.'
    }
  }

  return {
    ok: true,
    name: member.name,
    email: member.email,
    losses: [
      { label: 'Event signups', count: signups },
      { label: 'Balance records', count: balances.length },
      { label: 'Family relationships', count: relationships?.length ?? 0 },
      { label: 'Survey responses', count: surveyResponses },
      { label: 'Invitations', count: invitations },
    ].filter((l) => l.count > 0),
    amountOwed,
    amountPaid,
    blocker,
  }
}

/**
 * Deletes the caller's account, permanently.
 *
 * The rows go through the delete_my_account Postgres function so it is one
 * transaction and so the photo-tag cleanup cannot be skipped. Revoking the login
 * is a separate call to the Auth admin API with no transaction to join, and runs
 * last: a failure there leaves a login with no profile behind it, which is
 * recoverable, rather than a profile nobody can reach.
 */
export async function deleteMyAccount(confirmName: string): Promise<AccountDeletionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'You are not signed in.' }

  const memberId = await currentMemberId()
  if (!memberId) {
    return { ok: false, message: 'Your login is not linked to a profile in the directory.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('name')
    .eq('id', memberId)
    .single()
  if (!member) return { ok: false, message: 'Your profile could not be read.' }

  // Typing your own name is the whole confirmation. There is no undo behind
  // this and no support desk to restore it from.
  if (confirmName.trim().toLowerCase() !== String(member.name).trim().toLowerCase()) {
    return { ok: false, message: `Type "${member.name}" exactly to confirm.` }
  }

  const { data, error } = await supabase.rpc('delete_my_account')
  if (error) {
    // The last-admin refusal arrives here as a Postgres exception. Its message
    // is written for a person to read, so it is passed through rather than
    // replaced with something generic.
    return { ok: false, message: error.message }
  }

  const report = (data ?? {}) as Record<string, unknown>
  const authUserId = report.auth_user_id

  let loginWarning: string | null = null
  if (typeof authUserId === 'string' && authUserId) {
    const service = createServiceClient()
    const { error: authError } = await service.auth.admin.deleteUser(authUserId)
    if (authError) {
      loginWarning =
        `Your profile and everything in it were deleted, but the login itself could not be removed ` +
        `(${authError.message}). Nothing of yours remains in the directory, but ask an admin to ` +
        `finish revoking the login.`
    }
  }

  // The session belongs to a user who no longer exists; clearing it here means
  // the browser is not left holding a cookie that will fail on the next request.
  await supabase.auth.signOut()

  return {
    ok: true,
    name: String(report.deleted_name ?? member.name),
    loginWarning,
  }
}
