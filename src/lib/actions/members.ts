'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { Role } from '@/types/database'

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

  const { error } = await supabase
    .from('members')
    .update({
      name,
      phone: phone || null,
      address: address || null,
      family_branch: familyBranch || null,
      bio: bio || null,
      social_links: {
        facebook: facebook || null,
        instagram: instagram || null,
        linkedin: linkedin || null,
      },
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

  const { error } = await serviceClient.from('members').insert({
    name,
    email,
    phone: phone || null,
    family_branch: familyBranch || null,
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
