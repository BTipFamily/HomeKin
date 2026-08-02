'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { PhotoComment } from '@/lib/photo-social'

async function currentMember(): Promise<{ id: string; name: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await supabase
    .from('members')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) throw new Error('Member not found')
  return member as { id: string; name: string }
}

const COMMENT_SELECT = 'id, photo_id, body, created_at, author:author_id(id, name, photo_url)'

/**
 * Posts a comment and hands back the saved row.
 *
 * Returning it is what lets the client swap its placeholder rather than append
 * a second copy when the page refreshes — the same fix sendMessage makes for
 * chat, for the same reason.
 */
export async function addComment(
  photoId: string,
  reunionId: string,
  body: string
): Promise<PhotoComment> {
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Comment cannot be empty')

  const member = await currentMember()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('photo_comments')
    .insert({ photo_id: photoId, author_id: member.id, body: trimmed })
    .select(COMMENT_SELECT)
    .single()

  if (error) throw new Error(error.message)

  revalidatePath(`/reunion/${reunionId}/photos`)
  return data as unknown as PhotoComment
}

export async function deleteComment(commentId: string, reunionId: string): Promise<void> {
  await currentMember()
  const supabase = await createClient()

  // No .eq('author_id', ...) here: the policy also lets the committee moderate,
  // and repeating a narrower rule in the query would quietly break that.
  const { data, error } = await supabase
    .from('photo_comments')
    .delete()
    .eq('id', commentId)
    .select('id')

  if (error) throw new Error(error.message)
  // RLS refuses by returning no rows rather than erroring, so silence here
  // means "not allowed", not "done".
  if (!data || data.length === 0) throw new Error('That comment is not yours to delete')

  revalidatePath(`/reunion/${reunionId}/photos`)
}

/**
 * Likes a photo, or unlikes it if this member already had.
 *
 * Deliberately delete-then-insert rather than read-then-decide: the primary key
 * on (photo_id, member_id) is what actually guarantees one like per member, so
 * two taps racing each other end up at a consistent state instead of a count
 * that drifts. A duplicate insert is the one error swallowed, because it means
 * the like this call was trying to add is already there.
 */
export async function toggleLike(
  photoId: string,
  reunionId: string
): Promise<{ liked: boolean }> {
  const member = await currentMember()
  const supabase = await createClient()

  const { data: removed, error: deleteError } = await supabase
    .from('photo_likes')
    .delete()
    .eq('photo_id', photoId)
    .eq('member_id', member.id)
    .select('photo_id')

  if (deleteError) throw new Error(deleteError.message)

  if (removed && removed.length > 0) {
    revalidatePath(`/reunion/${reunionId}/photos`)
    return { liked: false }
  }

  const { error: insertError } = await supabase
    .from('photo_likes')
    .insert({ photo_id: photoId, member_id: member.id })

  // 23505 is the primary key doing its job: someone else's tab got there first.
  if (insertError && insertError.code !== '23505') throw new Error(insertError.message)

  revalidatePath(`/reunion/${reunionId}/photos`)
  return { liked: true }
}
