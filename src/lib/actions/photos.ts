'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function deletePhoto(photoId: string, reunionId: string, storagePath: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error: dbError } = await supabase.from('photos').delete().eq('id', photoId)
  if (dbError) throw new Error(dbError.message)

  // Use service client so the Storage file is removed regardless of bucket RLS
  const serviceClient = createServiceClient()
  const { error: storageError } = await serviceClient.storage
    .from('photos')
    .remove([storagePath])
  if (storageError) console.error('Storage delete error:', storageError)

  revalidatePath(`/reunion/${reunionId}/photos`)
}
