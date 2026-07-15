'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function deletePhoto(photoId: string, reunionId: string, storagePath: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error: dbError } = await supabase.from('photos').delete().eq('id', photoId)
  if (dbError) throw new Error(dbError.message)

  // Also remove from storage
  const { error: storageError } = await supabase.storage
    .from('photos')
    .remove([storagePath])
  if (storageError) console.error('Storage delete error:', storageError)

  revalidatePath(`/reunion/${reunionId}/photos`)
}
