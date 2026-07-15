'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function postMessage(
  reunionId: string,
  body: string,
  subEventId: string | null = null
) {
  if (!body.trim()) throw new Error('Message cannot be empty')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) throw new Error('Member not found')

  const { error } = await supabase.from('messages').insert({
    reunion_id: reunionId,
    sub_event_id: subEventId,
    sender_id: member.id,
    body: body.trim(),
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}/chat`)
}
