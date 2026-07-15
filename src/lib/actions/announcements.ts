'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createAnnouncement(reunionId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await supabase
    .from('members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member || !['committee', 'admin'].includes(member.role)) {
    throw new Error('Committee or admin access required')
  }

  const title = formData.get('title') as string
  const body = formData.get('body') as string
  const pinned = formData.get('pinned') === 'on'

  const { error } = await supabase.from('announcements').insert({
    reunion_id: reunionId,
    title,
    body,
    pinned,
    created_by: member.id,
  })

  if (error) throw new Error(error.message)

  // Phase 2: send email via Resend
  if (process.env.RESEND_API_KEY) {
    console.log(`[Email stub] Would send announcement "${title}" to all members`)
  } else {
    console.log(`[Email stub] Announcement "${title}" posted — configure RESEND_API_KEY to email members`)
  }

  revalidatePath(`/reunion/${reunionId}`)
}

export async function deleteAnnouncement(announcementId: string, reunionId: string) {
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
