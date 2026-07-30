import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { provisionMember } from '@/lib/auth-provision'
import { isConfirmType, safeNextPath } from '@/lib/signup-confirmation'

/**
 * Verifies a confirmation link that HomeKin emailed itself.
 *
 * The sibling `callback` route handles links Supabase generated, which arrive as
 * an exchangeable `code`. Ours carry a `token_hash` instead, because the link is
 * minted server-side with the admin API and never goes through Supabase's own
 * redirect. Everything after verification is identical, so both routes share
 * `provisionMember`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = safeNextPath(searchParams.get('next'))
  const inviteCode = searchParams.get('invite_code')

  const destination = (path: string) => {
    const forwardedHost = request.headers.get('x-forwarded-host')
    const base =
      process.env.NODE_ENV === 'development' || !forwardedHost
        ? origin
        : `https://${forwardedHost}`
    return NextResponse.redirect(`${base}${path}`)
  }

  if (!tokenHash || !isConfirmType(type)) {
    return destination('/login?error=confirm_link_invalid')
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })

  if (error || !data.user) {
    // A used or expired link is the common case here, and it is worth telling
    // people apart from a broken one: they need a new link, not support.
    return destination('/login?error=confirm_link_expired')
  }

  await provisionMember(createServiceClient(), data.user, inviteCode)

  return destination(next)
}
