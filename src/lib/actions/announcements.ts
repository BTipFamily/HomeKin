'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendBulkEmail } from '@/lib/email'
import { actionSuccess, failedWith, type ActionState } from '@/lib/action-state'
import { escapeHtml } from '@/lib/email-layout'

export type AnnouncementState = {
  status: 'idle' | 'success' | 'warning' | 'error'
  message: string
}

function announcementHtml(
  title: string,
  body: string,
  reunionName: string,
  reunionUrl: string
): string {
  // The body is plain text typed into a textarea, so escape it and turn the
  // line breaks the author typed into real ones rather than trusting it as HTML.
  const paragraphs = escapeHtml(body)
    .split(/\n{2,}/)
    .map((p) => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('')

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
      <p style="font-size:13px;color:#666;margin:0 0 4px;">${escapeHtml(reunionName)}</p>
      <h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(title)}</h1>
      ${paragraphs}
      <p style="margin:24px 0 0;">
        <a href="${reunionUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-size:14px;">
          Open in HomeKin
        </a>
      </p>
    </div>
  `
}

/**
 * Posts an announcement and, unless the author opts out, emails it to the
 * directory.
 *
 * The announcement is saved first and the email result only affects the message
 * shown back: a mail provider having a bad day should not lose what someone
 * just wrote.
 */
export async function createAnnouncement(
  reunionId: string,
  _prevState: AnnouncementState,
  formData: FormData
): Promise<AnnouncementState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'You are not signed in.' }

  const { data: member } = await supabase
    .from('members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member || !['committee', 'admin'].includes(member.role)) {
    return { status: 'error', message: 'Committee or admin access required.' }
  }

  const title = ((formData.get('title') as string) ?? '').trim()
  const body = ((formData.get('body') as string) ?? '').trim()
  const pinned = formData.get('pinned') === 'on'
  const notify = formData.get('notify') === 'on'

  if (!title || !body) {
    return { status: 'error', message: 'A title and a message are both required.' }
  }

  const { error } = await supabase.from('announcements').insert({
    reunion_id: reunionId,
    title,
    body,
    pinned,
    created_by: member.id,
  })

  if (error) return { status: 'error', message: error.message }

  revalidatePath(`/reunion/${reunionId}`)

  if (!notify) {
    return { status: 'success', message: 'Announcement posted. No email was sent.' }
  }

  const service = createServiceClient()
  const [{ data: recipients }, { data: reunion }] = await Promise.all([
    service.from('members').select('email'),
    service.from('reunions').select('name').eq('id', reunionId).single(),
  ])

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const result = await sendBulkEmail({
    recipients: ((recipients ?? []) as { email: string }[]).map((r) => r.email),
    subject: `${reunion?.name ?? 'Reunion'}: ${title}`,
    html: announcementHtml(
      title,
      body,
      reunion?.name ?? 'Family Reunion',
      `${appUrl}/reunion/${reunionId}`
    ),
  })

  if (result.notConfigured) {
    return {
      status: 'warning',
      message:
        'Announcement posted, but no email went out — email is not set up yet (SMTP_USER and SMTP_PASS are missing).',
    }
  }
  if (result.failed > 0) {
    return {
      status: 'warning',
      message: `Announcement posted and emailed to ${result.delivered} of ${result.recipients} members. ${result.failed} could not be reached${result.errors[0] ? ` — ${result.errors[0]}` : ''}.`,
    }
  }

  return {
    status: 'success',
    message: `Announcement posted and emailed to ${result.delivered} member${result.delivered === 1 ? '' : 's'}.`,
  }
}

async function applyDeleteAnnouncement(announcementId: string, reunionId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await supabase
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member || !['committee', 'admin'].includes(member.role)) {
    throw new Error('Committee or admin access required')
  }

  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', announcementId)

  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}`)
}

export async function togglePinAnnouncement(announcementId: string, reunionId: string, pinned: boolean) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await supabase
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member || !['committee', 'admin'].includes(member.role)) {
    throw new Error('Committee or admin access required')
  }

  const { error } = await supabase
    .from('announcements')
    .update({ pinned })
    .eq('id', announcementId)

  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}`)
}

/** Removing a post. Arguments are bound at the call site. */
export async function deleteAnnouncement(
  announcementId: string,
  reunionId: string,
  _prevState: ActionState
): Promise<ActionState> {
  try {
    await applyDeleteAnnouncement(announcementId, reunionId)
  } catch (e) {
    return failedWith(e, 'That announcement could not be removed.')
  }
  return actionSuccess('Removed.')
}
