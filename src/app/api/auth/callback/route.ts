import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import type { User } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { provisionMember } from '@/lib/auth-provision'
import { safeNextPath } from '@/lib/signup-confirmation'
import { importFacebookPhoto } from '@/lib/facebook-photo'
import { facebookPhotoEnabled } from '@/lib/feature-flags'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))
  const inviteCode = searchParams.get('invite_code')
  // Set by "Use my Facebook photo" (directory/[id]/edit/photo-upload.tsx).
  const facebookPhoto = searchParams.get('fb_photo') === '1' && facebookPhotoEnabled()

  if (code) {
    const supabase = await createClient()
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && sessionData.user) {
      const memberId = await provisionMember(createServiceClient(), sessionData.user, inviteCode)

      let destination = next
      if (facebookPhoto) {
        // Always the signed-in member's own row, whatever `next` says: Facebook
        // only gave us their picture, so it can only ever go on their profile.
        const ok = memberId
          ? await copyFacebookPhoto(
              supabase,
              memberId,
              sessionData.user,
              sessionData.session?.provider_token
            )
          : false
        destination = withParam(next, 'photo', ok ? 'facebook-ok' : 'facebook-failed')
      }

      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${destination}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${destination}`)
      } else {
        return NextResponse.redirect(`${origin}${destination}`)
      }
    }
  }

  // Cancelling at Facebook, or a Facebook account already linked to someone
  // else, arrives here with an error and no code. The member is already signed
  // in, so send them back to their profile to say so rather than to /login.
  if (facebookPhoto) {
    return NextResponse.redirect(`${origin}${withParam(next, 'photo', 'facebook-failed')}`)
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}

/**
 * Copies the picture, then unlinks Facebook from the account whatever the
 * outcome. HomeKin keeps the image only — no Facebook login, no token — which
 * is the promise the privacy policy makes and Meta's data-deletion rules want.
 * The member's email login is untouched, so unlinking always leaves them a way
 * in (Supabase refuses to unlink a last identity anyway).
 */
async function copyFacebookPhoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberId: string,
  user: User,
  providerToken: string | null | undefined
): Promise<boolean> {
  const identity = user.identities?.find((i) => i.provider === 'facebook')
  const data = (identity?.identity_data ?? {}) as Record<string, unknown>
  const fallbackUrl =
    typeof data.avatar_url === 'string'
      ? data.avatar_url
      : typeof data.picture === 'string'
        ? data.picture
        : null

  const result = await importFacebookPhoto({
    service: createServiceClient(),
    memberId,
    providerToken,
    fallbackUrl,
  })
  if (result.status === 'failed') {
    console.error('[facebook-photo] import failed:', result.reason)
  }

  if (identity) {
    const { error } = await supabase.auth.unlinkIdentity(identity)
    if (error) console.error('[facebook-photo] unlink failed:', error.message)
  }

  if (result.status === 'ok') {
    revalidatePath('/directory')
    revalidatePath(`/directory/${memberId}`)
    return true
  }
  return false
}

function withParam(path: string, key: string, value: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`
}
