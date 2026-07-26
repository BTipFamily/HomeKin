// Linking a newly signed-up auth user to the directory profile that was
// already waiting for them.
//
// Shared by the two places a signup can land — the email-confirmation callback
// and the immediate-session path — because a rule that only holds in one of
// them is how the same person ends up with two profiles.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The one true spelling of an email address in this app.
 *
 * Supabase Auth lowercases addresses when it creates an account, but a profile
 * typed in by an admin or pasted from a spreadsheet keeps whatever case it was
 * given. Comparing the two directly means `Joe@Gmail.com` never matches
 * `joe@gmail.com`, so the signup creates a duplicate instead of claiming the
 * existing profile.
 */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

export type ClaimableMember = { id: string; email: string }

/**
 * Finds an unclaimed profile whose email matches, ignoring case.
 *
 * Migration 012 lowercases stored addresses, so the fast path is an exact
 * match on the normalized value. The fallback scan covers rows that migration
 * had to skip — addresses held by more than one profile, which are duplicates
 * awaiting a merge. Picking the oldest of those is stable and predictable.
 */
export async function findClaimableMember(
  service: SupabaseClient,
  email: string
): Promise<ClaimableMember | null> {
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  const { data: exact } = await service
    .from('members')
    .select('id, email')
    .eq('email', normalized)
    .eq('created_by_proxy', true)
    .is('auth_user_id', null)
    .order('created_at', { ascending: true })
    .limit(1)

  if (exact && exact.length > 0) return exact[0] as ClaimableMember

  // `ilike` is not usable here: `_` is a wildcard in a LIKE pattern and a legal
  // character in an email local part, so `joe_smith@x.com` would match
  // addresses it should not. Compare in JS instead.
  const { data: unclaimed } = await service
    .from('members')
    .select('id, email')
    .eq('created_by_proxy', true)
    .is('auth_user_id', null)
    .order('created_at', { ascending: true })

  const match = (unclaimed ?? []).find(
    (m) => normalizeEmail((m as ClaimableMember).email) === normalized
  )
  return (match as ClaimableMember) ?? null
}

/**
 * Marks an invite code as redeemed.
 *
 * Runs for every successful signup, not only ones that created a profile:
 * someone who already had a member row used to leave their code redeemable
 * forever. The `used_at is null` guard keeps a second redemption from
 * overwriting the first.
 */
export async function redeemInviteCode(
  service: SupabaseClient,
  inviteCode: string | null | undefined,
  memberId: string
): Promise<void> {
  const code = (inviteCode ?? '').trim().toUpperCase()
  if (!code) return

  await service
    .from('invite_codes')
    .update({ used_by: memberId, used_at: new Date().toISOString() })
    .eq('code', code)
    .is('used_at', null)
}
