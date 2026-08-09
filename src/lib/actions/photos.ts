'use server'

import { revalidatePath } from 'next/cache'
import { actionSuccess, failedWith, type ActionState } from '@/lib/action-state'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/**
 * Removes a photo or video and the file(s) behind it.
 *
 * The row is deleted first and its own result is the authorization check.
 * This used to run the other way round in effect: the row delete went through
 * the anon client, so RLS refusing it returned zero rows and no error, and the
 * code carried on to erase the file with the service client — which bypasses
 * RLS and always succeeded. A committee member deleting someone else's photo
 * therefore destroyed the file and left the row, producing a broken tile that
 * nobody could clear. The paths are also taken from the row rather than from
 * the caller, who could otherwise name any object in the bucket.
 */
async function applyDeletePhoto(photoId: string, reunionId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: deleted, error: dbError } = await supabase
    .from('photos')
    .delete()
    .eq('id', photoId)
    .select('storage_path, thumbnail_path')

  if (dbError) throw new Error(dbError.message)
  // RLS refuses by deleting nothing rather than erroring, so an empty result
  // means "not allowed" — and must stop us before the file is touched.
  if (!deleted || deleted.length === 0) {
    throw new Error('That is not yours to delete')
  }

  // A video owns two objects: the clip and its poster frame.
  const paths = deleted.flatMap((row) =>
    row.thumbnail_path ? [row.storage_path, row.thumbnail_path] : [row.storage_path]
  )

  // Service client so the object goes regardless of bucket RLS. Safe now that
  // the row delete above has already proved the caller was allowed to.
  const serviceClient = createServiceClient()
  const { error: storageError } = await serviceClient.storage.from('photos').remove(paths)
  if (storageError) console.error('Storage delete error:', storageError)

  revalidatePath(`/reunion/${reunionId}/photos`)
}

/**
 * Removing a photo. Arguments are bound at the call site.
 *
 * Rescues "That is not yours to delete" — deliberately human wording for the
 * refused case that, thrown, arrived as the redacted generic error.
 */
export async function deletePhoto(
  photoId: string,
  reunionId: string,
  _prevState: ActionState
): Promise<ActionState> {
  try {
    await applyDeletePhoto(photoId, reunionId)
  } catch (e) {
    return failedWith(e, 'That photo could not be deleted.')
  }
  return actionSuccess('Deleted.')
}
