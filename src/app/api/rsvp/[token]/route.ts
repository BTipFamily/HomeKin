import { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const serviceClient = createServiceClient()

  const { data: invitation } = await serviceClient
    .from('invitations')
    .select('id, reunion_id, sub_event_id, responded_at')
    .eq('token', token)
    .single()

  if (!invitation) {
    redirect('/dashboard')
  }

  // Mark as opened (idempotent — only set once)
  await serviceClient
    .from('invitations')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', invitation.id)
    .is('opened_at', null)

  // If user is authenticated, also mark responded
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await serviceClient
      .from('invitations')
      .update({ responded_at: new Date().toISOString() })
      .eq('id', invitation.id)
      .is('responded_at', null)
  }

  const dest = invitation.sub_event_id
    ? `/reunion/${invitation.reunion_id}/events/${invitation.sub_event_id}`
    : `/reunion/${invitation.reunion_id}`

  redirect(dest)
}
