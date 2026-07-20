'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { geocodeAddress } from '@/lib/geocoding'

export async function deleteSubEvent(eventId: string, reunionId: string) {
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

  const serviceClient = createServiceClient()
  const { error } = await serviceClient.from('sub_events').delete().eq('id', eventId)
  if (error) throw new Error(error.message)

  revalidatePath(`/reunion/${reunionId}/events`)
  redirect(`/reunion/${reunionId}/events`)
}

export async function createSubEvent(reunionId: string, formData: FormData) {
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
  const description = formData.get('description') as string
  const date = formData.get('date') as string
  const time = formData.get('time') as string
  const locationName = formData.get('location_name') as string
  const address = formData.get('address') as string
  const costRaw = formData.get('cost_per_person') as string
  const capacityRaw = formData.get('capacity') as string
  const durationRaw = formData.get('duration_minutes') as string

  const cost = parseFloat(costRaw) || 0
  const capacity = capacityRaw ? parseInt(capacityRaw) : null
  const durationMinutes = durationRaw ? parseInt(durationRaw) : null

  if (cost < 0) throw new Error('Cost cannot be negative')
  if (capacity !== null && capacity < 1) throw new Error('Capacity must be at least 1')

  const normalizedAddress = address || null
  const geoFields: Record<string, unknown> = {}
  if (normalizedAddress) {
    const result = await geocodeAddress(normalizedAddress)
    geoFields.latitude = result?.lat ?? null
    geoFields.longitude = result?.lng ?? null
    geoFields.geocoded_address = result ? normalizedAddress : null
    geoFields.geocode_updated_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('sub_events')
    .insert({
      reunion_id: reunionId,
      name,
      description: description || null,
      date,
      time: time || null,
      location_name: locationName || null,
      address: normalizedAddress,
      cost_per_person: cost,
      capacity,
      duration_minutes: durationMinutes,
      created_by: member.id,
      ...geoFields,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  revalidatePath(`/reunion/${reunionId}/events`)
  revalidatePath(`/reunion/${reunionId}/map`)
  redirect(`/reunion/${reunionId}/events/${data.id}`)
}

export async function updateSubEvent(eventId: string, reunionId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const date = formData.get('date') as string
  const time = formData.get('time') as string
  const locationName = formData.get('location_name') as string
  const address = formData.get('address') as string
  const costRaw = formData.get('cost_per_person') as string
  const capacityRaw = formData.get('capacity') as string
  const durationRaw = formData.get('duration_minutes') as string

  const cost = parseFloat(costRaw) || 0
  const capacity = capacityRaw ? parseInt(capacityRaw) : null
  const durationMinutes = durationRaw ? parseInt(durationRaw) : null

  const normalizedAddress = address || null

  const { data: existing } = await supabase
    .from('sub_events')
    .select('geocoded_address')
    .eq('id', eventId)
    .single()

  const geoFields: Record<string, unknown> = {}
  if (normalizedAddress !== existing?.geocoded_address) {
    if (normalizedAddress) {
      const result = await geocodeAddress(normalizedAddress)
      geoFields.latitude = result?.lat ?? null
      geoFields.longitude = result?.lng ?? null
      geoFields.geocoded_address = result ? normalizedAddress : null
      geoFields.geocode_updated_at = new Date().toISOString()
    } else {
      geoFields.latitude = null
      geoFields.longitude = null
      geoFields.geocoded_address = null
      geoFields.geocode_updated_at = null
    }
  }

  const { error } = await supabase
    .from('sub_events')
    .update({
      name,
      description: description || null,
      date,
      time: time || null,
      location_name: locationName || null,
      address: normalizedAddress,
      cost_per_person: cost,
      capacity,
      duration_minutes: durationMinutes,
      ...geoFields,
    })
    .eq('id', eventId)

  if (error) throw new Error(error.message)

  revalidatePath(`/reunion/${reunionId}/events/${eventId}`)
  revalidatePath(`/reunion/${reunionId}/events`)
  revalidatePath(`/reunion/${reunionId}/map`)
}
