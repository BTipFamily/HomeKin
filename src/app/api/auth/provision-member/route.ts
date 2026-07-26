import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { findClaimableMember, normalizeEmail, redeemInviteCode } from '@/lib/member-linking'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { name, phone, family_branch, invite_code } = await request.json()

  const serviceClient = createServiceClient()
  const email = normalizeEmail(user.email)

  // Already provisioned — still redeem the code, since a signup that reused an
  // existing profile used to leave the invite code redeemable forever.
  const { data: existing } = await serviceClient
    .from('members')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (existing) {
    await redeemInviteCode(serviceClient, invite_code, existing.id)
    return NextResponse.json({ ok: true })
  }

  // Claim the directory profile that was added for this person ahead of time.
  const proxyMember = await findClaimableMember(serviceClient, email)

  if (proxyMember) {
    await serviceClient
      .from('members')
      .update({ auth_user_id: user.id, created_by_proxy: false, email })
      .eq('id', proxyMember.id)

    await redeemInviteCode(serviceClient, invite_code, proxyMember.id)
    return NextResponse.json({ ok: true })
  }

  const { data: newMember, error } = await serviceClient
    .from('members')
    .insert({
      auth_user_id: user.id,
      name: name || email.split('@')[0],
      email,
      phone: phone || null,
      family_branch: family_branch || null,
      role: 'member',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (newMember) await redeemInviteCode(serviceClient, invite_code, newMember.id)

  return NextResponse.json({ ok: true })
}
