'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { generateTimeline, type TimelineOptions } from '@/lib/timeline-generator'
import type { TimelineItemCategory } from '@/types/database'

async function requireMember(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await supabase
    .from('members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) throw new Error('Member not found')
  return member
}

// Any authenticated member can check items off — this is a shared family checklist.
export async function toggleTimelineItem(itemId: string, reunionId: string, complete: boolean) {
  const supabase = await createClient()
  await requireMember(supabase)

  const { error } = await supabase
    .from('reunion_timeline_items')
    .update({ is_complete: complete })
    .eq('id', itemId)

  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}/timeline`)
}

export async function addCustomTimelineItem(
  reunionId: string,
  input: { title: string; dueDate: string | null; category: TimelineItemCategory }
) {
  const supabase = await createClient()
  const member = await requireMember(supabase)
  if (!['committee', 'admin'].includes(member.role)) {
    throw new Error('Committee or admin access required')
  }

  const { error } = await supabase.from('reunion_timeline_items').insert({
    reunion_id: reunionId,
    title: input.title,
    due_date: input.dueDate,
    category: input.category,
    phase_label: 'Custom',
    is_custom: true,
    created_by: member.id,
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}/timeline`)
}

export async function deleteTimelineItem(itemId: string, reunionId: string) {
  const supabase = await createClient()
  const member = await requireMember(supabase)
  if (!['committee', 'admin'].includes(member.role)) {
    throw new Error('Committee or admin access required')
  }

  const { error } = await supabase.from('reunion_timeline_items').delete().eq('id', itemId)
  if (error) throw new Error(error.message)
  revalidatePath(`/reunion/${reunionId}/timeline`)
}

// Replaces all auto-generated items with a freshly generated set, based on
// the reunion's start date and the given options. Custom (hand-added) items
// are left untouched.
export async function regenerateTimeline(
  reunionId: string,
  startDate: string,
  options: TimelineOptions
) {
  const supabase = await createClient()
  const member = await requireMember(supabase)
  if (!['committee', 'admin'].includes(member.role)) {
    throw new Error('Committee or admin access required')
  }

  const { error: deleteError } = await supabase
    .from('reunion_timeline_items')
    .delete()
    .eq('reunion_id', reunionId)
    .eq('is_custom', false)
  if (deleteError) throw new Error(deleteError.message)

  const items = generateTimeline(startDate, options)
  const { error: insertError } = await supabase.from('reunion_timeline_items').insert(
    items.map((item) => ({
      reunion_id: reunionId,
      title: item.title,
      phase_label: item.phase_label,
      category: item.category,
      due_date: item.due_date,
      sort_order: item.sort_order,
      created_by: member.id,
    }))
  )
  if (insertError) throw new Error(insertError.message)

  revalidatePath(`/reunion/${reunionId}/timeline`)
}
