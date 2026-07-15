'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

export async function sendInvitations(
  reunionId: string,
  memberIds: string[],
  subEventId: string | null = null
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: sender } = await supabase
    .from('members')
    .select('id, role, name')
    .eq('auth_user_id', user.id)
    .single()
  if (!sender || !['committee', 'admin'].includes(sender.role)) {
    throw new Error('Committee access required')
  }

  const serviceClient = createServiceClient()

  const { data: reunion } = await serviceClient
    .from('reunions')
    .select('name')
    .eq('id', reunionId)
    .single()

  let subEventName: string | null = null
  if (subEventId) {
    const { data: evt } = await serviceClient
      .from('sub_events')
      .select('name')
      .eq('id', subEventId)
      .single()
    subEventName = evt?.name ?? null
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Fetch member details for email
  const { data: members } = await serviceClient
    .from('members')
    .select('id, name, email')
    .in('id', memberIds)

  if (!members) throw new Error('Could not fetch members')

  for (const m of members) {
    // Create invitation row
    const { data: invitation } = await serviceClient
      .from('invitations')
      .insert({
        reunion_id: reunionId,
        sub_event_id: subEventId,
        member_id: m.id,
        sent_at: new Date().toISOString(),
      })
      .select('token')
      .single()

    if (!invitation) continue

    const rsvpUrl = `${appUrl}/api/rsvp/${invitation.token}`
    const subject = subEventName
      ? `You're invited to ${subEventName} — ${reunion?.name}`
      : `You're invited to ${reunion?.name}`

    const html = `
      <p>Hi ${m.name},</p>
      <p>${sender.name} has invited you to <strong>${reunion?.name}</strong>${subEventName ? ` — specifically for <strong>${subEventName}</strong>` : ''}.</p>
      <p><a href="${rsvpUrl}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">View Invitation</a></p>
      <p style="color:#666;font-size:12px;">If the button doesn't work, copy this link: ${rsvpUrl}</p>
    `

    await sendEmail({ to: m.email, subject, html })
  }

  revalidatePath(`/reunion/${reunionId}/invitations`)
}
