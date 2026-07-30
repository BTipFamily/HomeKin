// Turning a freshly verified auth user into a member of the directory.
//
// Three entry points reach this now — the OAuth/magic-link callback, the
// confirmation link we email ourselves, and the immediate-session path after
// signup. They have to agree, or the same person ends up with two profiles.

import type { SupabaseClient, User } from '@supabase/supabase-js'
import { findClaimableMember, normalizeEmail, redeemInviteCode } from '@/lib/member-linking'

/**
 * Links `user` to a member row, creating one if nothing is waiting for them,
 * and redeems the invite code either way.
 *
 * Returns the member id, or null if the row could not be created.
 */
export async function provisionMember(
  service: SupabaseClient,
  user: User,
  inviteCode: string | null | undefined,
  profile?: { name?: string | null; phone?: string | null; family_branch?: string | null }
): Promise<string | null> {
  const email = normalizeEmail(user.email)

  const { data: existingMember } = await service
    .from('members')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  let memberId: string | null = existingMember?.id ?? null

  if (!memberId) {
    // Claim the directory profile added for this person ahead of time, matching
    // on email without regard to case — Supabase Auth lowercases addresses,
    // profiles added by hand keep whatever case they were given.
    const proxyMember = await findClaimableMember(service, email)

    if (proxyMember) {
      await service
        .from('members')
        .update({ auth_user_id: user.id, created_by_proxy: false, email })
        .eq('id', proxyMember.id)
      memberId = proxyMember.id
    } else {
      const meta = (user.user_metadata || {}) as Record<string, string | undefined>
      const { data: created } = await service
        .from('members')
        .insert({
          auth_user_id: user.id,
          name: profile?.name || meta.name || email.split('@')[0],
          email,
          phone: profile?.phone || meta.phone || null,
          family_branch: profile?.family_branch || meta.family_branch || null,
          role: 'member',
        })
        .select('id')
        .single()
      memberId = created?.id ?? null
    }
  }

  // Redeem the code whether or not a profile was just created: someone who
  // already had a member row used to leave their code redeemable forever.
  if (memberId) await redeemInviteCode(service, inviteCode, memberId)

  return memberId
}
