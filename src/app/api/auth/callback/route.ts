import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

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

      // Check if a member record already exists for this user
      const { data: existingMember } = await serviceClient
        .from('members')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!existingMember) {
        // Check if there's a proxy member record with this email
        const { data: proxyMember } = await serviceClient
          .from('members')
          .select('id')
          .eq('email', user.email!)
          .eq('created_by_proxy', true)
          .is('auth_user_id', null)
          .single()

        if (proxyMember) {
          // Link proxy profile to auth user
          await serviceClient
            .from('members')
            .update({ auth_user_id: user.id, created_by_proxy: false })
            .eq('id', proxyMember.id)
        } else {
          // Create a new member record using data from the OTP sign-up
          const meta = user.user_metadata || {}
          await serviceClient.from('members').insert({
            auth_user_id: user.id,
            name: meta.name || user.email!.split('@')[0],
            email: user.email!,
            phone: meta.phone || null,
            family_branch: meta.family_branch || null,
            role: 'member',
          })
        }

        // Mark invite code as used
        if (inviteCode) {
          const { data: memberRow } = await serviceClient
            .from('members')
            .select('id')
            .eq('auth_user_id', user.id)
            .single()

          if (memberRow) {
            await serviceClient
              .from('invite_codes')
              .update({ used_by: memberRow.id, used_at: new Date().toISOString() })
              .eq('code', inviteCode)
              .is('used_at', null)
          }
        }
      }

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
