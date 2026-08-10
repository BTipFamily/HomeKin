import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — important for SSR
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public paths that don't require auth. /api/webhooks is called
  // server-to-server by Stripe (authenticated via signature verification,
  // never a session cookie), /api/rsvp is opened by invitees who may
  // not have an account yet (authenticated by the unguessable token in
  // the URL), and /api/cron is called by Vercel Cron (authenticated by the
  // CRON_SECRET bearer token) — all three would otherwise get redirected to
  // /login before their handler ever runs. For the cron that failure is
  // completely silent: the scheduler follows the redirect, gets a 200 from the
  // login page, records a successful run, and not one reminder goes out.
  //
  // /terms and /privacy are public because they have to be readable by somebody
  // who has not signed up and never will: App Store Connect is given the privacy
  // policy as a URL and opens it without a session, and a reviewer reads both
  // before making an account. Behind the redirect they would resolve to a login
  // form, which reads as a broken link.
  //
  // /goodbye is public for a sharper reason. It is reached immediately after
  // deleting your own account, when the session has just been destroyed on
  // purpose — so it is guaranteed to arrive here with no user. Left off this
  // list it would bounce to /login every single time, and the last thing anyone
  // saw on their way out would be a sign-in form telling them nothing worked.
  const isPublicPath =
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/goodbye') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/rsvp') ||
    pathname.startsWith('/api/cron') ||
    pathname === '/'

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from the landing page and login/signup,
  // unless they were sent here with an error (e.g. no matching member profile)
  // — otherwise this creates an infinite redirect loop with
  // /login?error=no_profile.
  //
  // Doing this here rather than in the page is what lets `/` stay static: the
  // session is already resolved above for every request, so the marketing page
  // never has to read a cookie to find out who is looking at it.
  const hasError = request.nextUrl.searchParams.has('error')
  if (user && !hasError && (pathname === '/' || pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
