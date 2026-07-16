import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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

  // Check if a member record already exists for this user
  const { data: existing } = await serviceClient
    .from('members')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (existing) {
    return NextResponse.json({ ok: true })
  }

  // Check for a proxy member with this email to link instead of creating new
  const { data: proxyMember } = await serviceClient
    .from('members')
    .select('id')
    .eq('email', user.email!)
    .eq('created_by_proxy', true)
    .is('auth_user_id', null)
    .single()

  if (proxyMember) {
    await serviceClient
      .from('members')
      .update({ auth_user_id: user.id, created_by_proxy: false })
      .eq('id', proxyMember.id)

    if (invite_code) {
      await serviceClient
        .from('invite_codes')
        .update({ used_by: proxyMember.id, used_at: new Date().toISOString() })
        .eq('code', invite_code)
        .is('used_at', null)
    }

    return NextResponse.json({ ok: true })
  }

  // Create a new member record
  const { data: newMember, error } = await serviceClient
    .from('members')
    .insert({
      auth_user_id: user.id,
      name: name || user.email!.split('@')[0],
      email: user.email!,
      phone: phone || null,
      family_branch: family_branch || null,
      role: 'member',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (invite_code && newMember) {
    await serviceClient
      .from('invite_codes')
      .update({ used_by: newMember.id, used_at: new Date().toISOString() })
      .eq('code', invite_code)
      .is('used_at', null)
  }

  return NextResponse.json({ ok: true })
}
