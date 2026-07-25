'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { geocodeAddress } from '@/lib/geocoding'
import { parseBirthDate } from '@/lib/birthday'
import type { Role } from '@/types/database'

/**
 * Reads a date-of-birth field off a form. `<input type="date">` submits ISO,
 * but the field is also reachable by anyone who can POST the action, so the
 * value is re-validated here rather than trusted.
 */
function readDateOfBirth(formData: FormData): string | null {
  const raw = ((formData.get('date_of_birth') as string) ?? '').trim()
  if (!raw) return null

  const parsed = parseBirthDate(raw)
  if ('error' in parsed) throw new Error(`Date of birth ${parsed.error}`)
  return parsed.iso
}

export async function updateMemberProfile(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const memberId = formData.get('member_id') as string
  const name = formData.get('name') as string
  const phone = formData.get('phone') as string
  const address = formData.get('address') as string
  const familyBranch = formData.get('family_branch') as string
  const bio = formData.get('bio') as string
  const facebook = formData.get('facebook') as string
  const instagram = formData.get('instagram') as string
  const linkedin = formData.get('linkedin') as string
  const dateOfBirth = readDateOfBirth(formData)

  const normalizedAddress = address || null

  const { data: existing } = await supabase
    .from('members')
    .select('geocoded_address')
    .eq('id', memberId)
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
    .from('members')
    .update({
      name,
      phone: phone || null,
      address: normalizedAddress,
      family_branch: familyBranch || null,
      date_of_birth: dateOfBirth,
      bio: bio || null,
      social_links: {
        facebook: facebook || null,
        instagram: instagram || null,
        linkedin: linkedin || null,
      },
      ...geoFields,
    })
    .eq('id', memberId)

  if (error) throw new Error(error.message)

  revalidatePath(`/directory/${memberId}`)
  revalidatePath(`/directory/${memberId}/edit`)
  revalidatePath('/directory')
}

export async function createProxyMember(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Verify admin role
  const { data: currentMember } = await supabase
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (currentMember?.role !== 'admin') throw new Error('Admin access required')

  const serviceClient = createServiceClient()

  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const phone = formData.get('phone') as string
  const familyBranch = formData.get('family_branch') as string
  const dateOfBirth = readDateOfBirth(formData)

  const { error } = await serviceClient.from('members').insert({
    name,
    email,
    phone: phone || null,
    family_branch: familyBranch || null,
    date_of_birth: dateOfBirth,
    role: 'member',
    created_by_proxy: true,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/directory')
  revalidatePath('/admin/members')
}

export async function updateMemberRole(memberId: string, role: Role) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: currentMember } = await supabase
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()
  if (currentMember?.role !== 'admin') throw new Error('Admin access required')

  const serviceClient = createServiceClient()
  const { error } = await serviceClient
    .from('members')
    .update({ role })
    .eq('id', memberId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin/members')
  revalidatePath('/directory')
}

export async function updateProfilePhoto(memberId: string, photoUrl: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('members')
    .update({ photo_url: photoUrl })
    .eq('id', memberId)

  if (error) throw new Error(error.message)
  revalidatePath(`/directory/${memberId}`)
  revalidatePath('/directory')
}
