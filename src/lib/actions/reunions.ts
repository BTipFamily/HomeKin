'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { geocodeAddress } from '@/lib/geocoding'
import { actionError, actionSuccess, failedWith, type ActionState } from '@/lib/action-state'
import { REUNION_PHASES, phaseCopy, type ReunionPhase } from '@/lib/reunion-phase'

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

async function applyReunionUpdate(reunionId: string, formData: FormData) {
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

/**
 * Moving a reunion to another stage.
 *
 * Until this existed nothing moved a reunion past 'planning' — the wizard
 * starts it at 'interest' and settling a date advances it once — so everything
 * the reunion page leads with from registration onwards was unreachable.
 *
 * Any stage, forwards or back: the phase is advisory and an organiser who
 * clicked too early must be able to undo it.
 */
export async function setReunionPhase(
  reunionId: string,
  phase: string,
  _prevState: ActionState,
  formData?: FormData
): Promise<ActionState> {
  // A select on the manage page sends the stage as a field; the reunion page's
  // one-click "move on" binds it. Either way it is checked here, before the
  // check constraint can fail with a database message.
  const requested = (formData?.get('phase') as string | null) || phase
  if (!REUNION_PHASES.includes(requested as ReunionPhase)) {
    return actionError('That is not a stage a reunion can be in.')
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    // RLS limits the update to the committee as well, but a blocked update
    // affects no rows and reports no error — which would read as success.
    const { data: member } = await supabase
      .from('members')
      .select('role')
      .eq('auth_user_id', user.id)
      .single()
    if (!member || !['committee', 'admin'].includes(member.role)) {
      throw new Error('Only the committee can change the stage of a reunion.')
    }

    const { error } = await supabase
      .from('reunions')
      .update({ status: requested })
      .eq('id', reunionId)
    if (error) throw new Error(error.message)
  } catch (e) {
    return failedWith(e, 'The stage could not be changed.')
  }

  revalidatePath(`/reunion/${reunionId}`)
  revalidatePath(`/reunion/${reunionId}/manage`)
  revalidatePath('/dashboard')
  return actionSuccess(`Moved to “${phaseCopy(requested as ReunionPhase).label}”.`)
}

/**
 * Saving the reunion's own details.
 *
 * No redirect on success — it revalidates this page, and a redirect would
 * discard the only place a failure could be shown.
 */
export async function updateReunion(
  reunionId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await applyReunionUpdate(reunionId, formData)
  } catch (e) {
    return failedWith(e, 'The reunion could not be saved.')
  }
  return actionSuccess('Saved.')
}
