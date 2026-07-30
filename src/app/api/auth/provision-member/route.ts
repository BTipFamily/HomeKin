import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { provisionMember } from '@/lib/auth-provision'

/**
 * The immediate-session path: used when signup returns a session without an
 * email round-trip, so neither confirmation route ever runs.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { name, phone, family_branch, invite_code } = await request.json()

  const memberId = await provisionMember(createServiceClient(), user, invite_code, {
    name,
    phone,
    family_branch,
  })

  if (!memberId) {
    return NextResponse.json({ error: 'Could not create your profile' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
