'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { ChatMessage } from '@/lib/chat'
import type { RosterMember } from '@/lib/presence'

async function currentMember(): Promise<{ id: string }> {
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
  return member as { id: string }
}

/**
 * Posts a message and hands back the saved row.
 *
 * Returning it is the fix for the duplication: the client swaps its placeholder
 * for this, so the poll that later sees the same row recognises it instead of
 * appending a second copy.
 */
export async function sendMessage(
  reunionId: string,
  body: string,
  subEventId: string | null = null
): Promise<ChatMessage> {
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Message cannot be empty')

  const member = await currentMember()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('messages')
    .insert({
      reunion_id: reunionId,
      sub_event_id: subEventId,
      sender_id: member.id,
      body: trimmed,
    })
    .select('id, body, created_at, sender:sender_id(id, name, photo_url)')
    .single()

  if (error) throw new Error(error.message)

  // Sending is also reading: do not notify someone about their own message.
  await markChannelRead(reunionId, subEventId)

  return data as unknown as ChatMessage
}

/** Records that the signed-in member has seen everything in a channel. */
export async function markChannelRead(
  reunionId: string,
  subEventId: string | null,
  channel: 'chat' | 'announcements' = 'chat'
): Promise<void> {
  const member = await currentMember()
  const service = createServiceClient()

  // Two partial unique indexes cover the nullable sub_event_id, which onConflict
  // cannot target, so look first and then write.
  let query = service
    .from('read_receipts')
    .select('id')
    .eq('member_id', member.id)
    .eq('channel', channel)
    .eq('reunion_id', reunionId)

  query = subEventId ? query.eq('sub_event_id', subEventId) : query.is('sub_event_id', null)

  const { data: existing } = await query.maybeSingle()
  const now = new Date().toISOString()

  if (existing) {
    await service.from('read_receipts').update({ last_read_at: now }).eq('id', existing.id)
  } else {
    await service.from('read_receipts').insert({
      member_id: member.id,
      reunion_id: reunionId,
      channel,
      sub_event_id: subEventId,
      last_read_at: now,
    })
  }

  revalidatePath('/dashboard')
  revalidatePath(`/reunion/${reunionId}`)
}

export type UnreadCounts = { chat: number; announcements: number }

/** Unread totals per reunion for the signed-in member, keyed by reunion id. */
export async function getUnreadCounts(): Promise<Record<string, UnreadCounts>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return {}

  const { data, error } = await supabase.rpc('my_unread_counts')
  if (error || !data) return {}

  const counts: Record<string, UnreadCounts> = {}
  for (const row of data as { reunion_id: string; chat_unread: number; announcements_unread: number }[]) {
    counts[row.reunion_id] = {
      chat: Number(row.chat_unread ?? 0),
      announcements: Number(row.announcements_unread ?? 0),
    }
  }
  return counts
}

/** Everyone in the directory, with when they were last seen. */
export async function getRoster(): Promise<RosterMember[]> {
  await currentMember()
  const service = createServiceClient()

  const { data } = await service
    .from('members')
    .select('id, name, photo_url, last_seen_at')
    .order('name')

  return (data ?? []) as RosterMember[]
}
