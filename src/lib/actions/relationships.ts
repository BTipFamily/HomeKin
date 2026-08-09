'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { actionSuccess, failedWith, type ActionState } from '@/lib/action-state'
import type { ParentChildKind, PartnerStatus } from '@/types/database'

function revalidateForMembers(memberIds: string[]) {
  revalidatePath('/family-tree')
  for (const id of memberIds) {
    revalidatePath(`/directory/${id}`)
    revalidatePath(`/directory/${id}/edit`)
  }
}

async function getMyMemberId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: me } = await supabase
    .from('members')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!me) throw new Error('Member record not found')
  return me.id
}

export async function addParentChildRelationship(formData: FormData) {
  const supabase = await createClient()
  const createdBy = await getMyMemberId()

  const parentMemberId = formData.get('parent_member_id') as string
  const childMemberId = formData.get('child_member_id') as string
  const kind = formData.get('kind') as ParentChildKind

  const { error } = await supabase.from('relationships').insert({
    member_id: parentMemberId,
    related_member_id: childMemberId,
    relationship_type: 'parent_child',
    parent_child_kind: kind,
    created_by: createdBy,
  })

  if (error) throw new Error(error.message)
  revalidateForMembers([parentMemberId, childMemberId])
}

export async function addPartnerRelationship(formData: FormData) {
  const supabase = await createClient()
  const createdBy = await getMyMemberId()

  const memberId = formData.get('member_id') as string
  const partnerMemberId = formData.get('partner_member_id') as string
  const status = formData.get('status') as PartnerStatus
  const startDate = (formData.get('start_date') as string) || null
  const endDate = (formData.get('end_date') as string) || null

  // Partner edges are conceptually symmetric but stored as one directed
  // row — check both directions so we update rather than duplicate.
  const { data: existing } = await supabase
    .from('relationships')
    .select('id')
    .eq('relationship_type', 'partner')
    .or(
      `and(member_id.eq.${memberId},related_member_id.eq.${partnerMemberId}),and(member_id.eq.${partnerMemberId},related_member_id.eq.${memberId})`
    )
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('relationships')
      .update({
        partner_status: status,
        partner_start_date: startDate,
        partner_end_date: endDate,
      })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('relationships').insert({
      member_id: memberId,
      related_member_id: partnerMemberId,
      relationship_type: 'partner',
      partner_status: status,
      partner_start_date: startDate,
      partner_end_date: endDate,
      created_by: createdBy,
    })
    if (error) throw new Error(error.message)
  }

  revalidateForMembers([memberId, partnerMemberId])
}

export async function addCustomRelationship(formData: FormData) {
  const supabase = await createClient()
  const createdBy = await getMyMemberId()

  const memberId = formData.get('member_id') as string
  const relatedMemberId = formData.get('related_member_id') as string
  const customLabel = formData.get('custom_label') as string

  const { error } = await supabase.from('relationships').insert({
    member_id: memberId,
    related_member_id: relatedMemberId,
    relationship_type: 'custom',
    custom_label: customLabel,
    created_by: createdBy,
  })

  if (error) throw new Error(error.message)
  revalidateForMembers([memberId, relatedMemberId])
}

async function removeRelationship(relationshipId: string, memberIds: [string, string]) {
  const supabase = await createClient()

  // Checked, where it was not before. Without this the delete simply matched no
  // rows when the policy refused it: no error, nothing removed, and the page
  // revalidated as though it had worked. A link somebody thought they had
  // deleted stayed on their profile.
  await getMyMemberId()

  const { data, error } = await supabase
    .from('relationships')
    .delete()
    .eq('id', relationshipId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('That relationship could not be removed — it may already be gone.')
  }
  revalidateForMembers(memberIds)
}

/** Removing a link between two people. Arguments are bound at the call site. */
export async function deleteRelationship(
  relationshipId: string,
  memberIds: [string, string],
  _prevState: ActionState
): Promise<ActionState> {
  try {
    await removeRelationship(relationshipId, memberIds)
  } catch (e) {
    return failedWith(e, 'That relationship could not be removed.')
  }
  return actionSuccess('Removed.')
}

export async function searchMembersForRelationshipPicker(
  query: string,
  excludeMemberId: string
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const trimmed = query.trim()
  if (!trimmed) return []

  const { data, error } = await supabase
    .from('members')
    .select('id, name, photo_url, family_branch')
    .ilike('name', `%${trimmed}%`)
    .neq('id', excludeMemberId)
    .limit(10)

  if (error) throw new Error(error.message)
  return data
}
