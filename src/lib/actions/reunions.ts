'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { geocodeAddress } from '@/lib/geocoding'

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
  const locationName = formData.get('location_name') as string
  const address = formData.get('address') as string
  const startDate = (formData.get('start_date') as string) || null
  const endDate = (formData.get('end_date') as string) || null

  const normalizedAddress = address || null

  const { data: existing } = await supabase
    .from('reunions')
    .select('address')
    .eq('id', reunionId)
    .single()

  const geoFields: Record<string, unknown> = {}
  if (normalizedAddress !== existing?.address) {
    if (normalizedAddress) {
      const result = await geocodeAddress(normalizedAddress)
      geoFields.latitude = result?.lat ?? null
      geoFields.longitude = result?.lng ?? null
    } else {
      geoFields.latitude = null
      geoFields.longitude = null
    }
  }

  const { error } = await supabase
    .from('reunions')
    .update({
      name,
      year,
      description: description || null,
      location_name: locationName || null,
      address: normalizedAddress,
      start_date: startDate,
      end_date: endDate,
      ...geoFields,
    })
    .eq('id', reunionId)

  if (error) throw new Error(error.message)

  revalidatePath(`/reunion/${reunionId}`)
  revalidatePath(`/reunion/${reunionId}/manage`)
  revalidatePath(`/reunion/${reunionId}/map`)
  revalidatePath('/dashboard')
}
