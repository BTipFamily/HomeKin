import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { findClaimableMember, normalizeEmail, redeemInviteCode } from '@/lib/member-linking'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const inviteCode = searchParams.get('invite_code')

  if (code) {
    const supabase = await createClient()
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && sessionData.user) {
      const user = sessionData.user
      const serviceClient = createServiceClient()
      const email = normalizeEmail(user.email)

      const { data: existingMember } = await serviceClient
        .from('members')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      let memberId = existingMember?.id ?? null

      if (!memberId) {
        // Claim the directory profile added for this person ahead of time,
        // matching on email without regard to case — Supabase Auth lowercases
        // addresses, profiles added by hand keep whatever case they were given.
        const proxyMember = await findClaimableMember(serviceClient, email)

        if (proxyMember) {
          await serviceClient
            .from('members')
            .update({ auth_user_id: user.id, created_by_proxy: false, email })
            .eq('id', proxyMember.id)
          memberId = proxyMember.id
        } else {
          const meta = user.user_metadata || {}
          const { data: created } = await serviceClient
            .from('members')
            .insert({
              auth_user_id: user.id,
              name: meta.name || email.split('@')[0],
              email,
              phone: meta.phone || null,
              family_branch: meta.family_branch || null,
              role: 'member',
            })
            .select('id')
            .single()
          memberId = created?.id ?? null
        }
      }

      // Redeem the code whether or not a profile was just created: someone who
      // already had a member row used to leave their code redeemable forever.
      if (memberId) await redeemInviteCode(serviceClient, inviteCode, memberId)

      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
