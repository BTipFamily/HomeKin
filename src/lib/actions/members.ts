'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { geocodeAddress } from '@/lib/geocoding'
import { parseBirthDate } from '@/lib/birthday'
import { normalizeEmail } from '@/lib/member-linking'
import type { Role } from '@/types/database'
import { actionSuccess, failedWith, type ActionState } from '@/lib/action-state'

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

async function applyProfileUpdate(formData: FormData) {
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
      // A standing offer to help, separate from whether they are free for any
      // particular reunion — that answer lives on interest_responses.
      volunteer_interest: formData.get('volunteer_interest') === 'on',
      volunteer_areas: formData.getAll('volunteer_areas') as string[],
      ...geoFields,
    })
    .eq('id', memberId)

  if (error) throw new Error(error.message)

  await saveSupportNeeds(supabase, memberId, formData)

  revalidatePath(`/directory/${memberId}`)
  revalidatePath(`/directory/${memberId}/edit`)
  revalidatePath('/directory')
}

/**
 * Writes the dietary, health and mobility notes.
 *
 * A separate table rather than columns on `members`, and deliberately through
 * the ordinary client rather than the service role: `member_support_needs` has
 * a real select policy, and going around it here would undo the whole reason
 * the table exists. See migration 030.
 *
 * Blank on every field with sharing off means the member has nothing to record,
 * so the row is removed rather than kept as an empty shell — a health record
 * that exists but says nothing is worse than no record, because a committee
 * reading the list cannot tell "no needs" from "never asked".
 */
async function saveSupportNeeds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberId: string,
  formData: FormData
) {
  const dietary = ((formData.get('dietary_notes') as string) ?? '').trim()
  const health = ((formData.get('health_notes') as string) ?? '').trim()
  const mobility = ((formData.get('mobility_notes') as string) ?? '').trim()
  const share = formData.get('share_with_family') === 'on'

  if (!dietary && !health && !mobility) {
    const { error } = await supabase.from('member_support_needs').delete().eq('member_id', memberId)
    if (error) throw new Error(error.message)
    return
  }

  const { error } = await supabase.from('member_support_needs').upsert(
    {
      member_id: memberId,
      dietary_notes: dietary || null,
      health_notes: health || null,
      mobility_notes: mobility || null,
      share_with_family: share,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'member_id' }
  )

  if (error) throw new Error(error.message)
}

async function applyProxyMember(formData: FormData) {
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
  // Stored lowercase so the signup that later claims this profile can find it:
  // Supabase Auth lowercases addresses, and members.email compares case-
  // sensitively, so a capitalised address here would never match.
  const email = normalizeEmail(formData.get('email') as string)
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

async function applyMemberRole(memberId: string, role: Role) {
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

/**
 * Saving somebody's profile.
 *
 * The date-of-birth check raises a sentence worth reading — "Date of birth must
 * be a real date" and similar from parseBirthDate — which thrown was reaching
 * people as Next's redacted placeholder on a 206-field form, with nothing to
 * say which field was wrong.
 */
export async function updateMemberProfile(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await applyProfileUpdate(formData)
  } catch (e) {
    return failedWith(e, 'Your profile could not be saved.')
  }
  return actionSuccess('Profile saved.')
}

/** Creating a placeholder profile for somebody who has not signed up. */
export async function createProxyMember(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await applyProxyMember(formData)
  } catch (e) {
    // A duplicate email arrives here as a raw Postgres unique-violation, which
    // is unhelpful but still far better than the redacted placeholder — and it
    // is the single most likely thing to go wrong on this form.
    return failedWith(e, 'That profile could not be created.')
  }
  return actionSuccess('Profile created.')
}

/** Promoting or demoting somebody. Arguments are bound at the call site. */
export async function updateMemberRole(
  memberId: string,
  role: Role,
  _prevState: ActionState
): Promise<ActionState> {
  try {
    await applyMemberRole(memberId, role)
  } catch (e) {
    return failedWith(e, 'That role could not be changed.')
  }
  return actionSuccess(`Now ${role}.`)
}
