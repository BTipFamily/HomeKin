'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function generateInviteCode(formData: FormData) {
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
  if (!member || member.role !== 'admin') throw new Error('Admin access required')

  const reunionId = formData.get('reunion_id') as string | null
  const expiresInDays = parseInt((formData.get('expires_in_days') as string) || '30')

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)

  const serviceClient = createServiceClient()

  // Generate a unique 8-char code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }

  const { error } = await serviceClient.from('invite_codes').insert({
    code,
    reunion_id: reunionId || null,
    created_by: member.id,
    expires_at: expiresAt.toISOString(),
  })

  if (error) throw new Error(error.message)

  revalidatePath('/admin/invite')
}
