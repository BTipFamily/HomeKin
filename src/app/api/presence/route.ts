import { createClient, createServiceClient } from '@/lib/supabase/server'

/**
 * Heartbeat from an open tab.
 *
 * Deliberately a route handler rather than the middleware: the middleware runs
 * on every request, and a write there would add a database round-trip to every
 * page load for a timestamp only the chat roster reads.
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false }, { status: 401 })

  const service = createServiceClient()
  const { error } = await service
    .from('members')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('auth_user_id', user.id)

  if (error) {
    // A missed heartbeat only ages someone out of the roster early, so this is
    // logged rather than surfaced.
    console.error('Presence heartbeat failed:', error.message)
    return Response.json({ ok: false }, { status: 500 })
  }

  return Response.json({ ok: true })
}
