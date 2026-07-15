'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createReunion(formData: FormData) {
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

  const name = formData.get('name') as string
  const year = parseInt(formData.get('year') as string)
  const description = formData.get('description') as string

  const { data, error } = await supabase
    .from('reunions')
    .insert({ name, year, description: description || null, created_by: member.id })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath('/dashboard')
  redirect(`/reunion/${data.id}`)
}

export async function updateReunion(reunionId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const name = formData.get('name') as string
  const year = parseInt(formData.get('year') as string)
  const description = formData.get('description') as string

  const { error } = await supabase
    .from('reunions')
    .update({ name, year, description: description || null })
    .eq('id', reunionId)

  if (error) throw new Error(error.message)

  revalidatePath(`/reunion/${reunionId}`)
  revalidatePath('/dashboard')
}
