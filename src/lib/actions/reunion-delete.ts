'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/** Supabase Storage removes in batches; keep each request a sane size. */
const STORAGE_BATCH_SIZE = 100

async function requireAdmin(): Promise<void> {
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

  if (member?.role !== 'admin') throw new Error('Admin access required')
}

export type ReunionDeletionPreview = {
  id: string
  name: string
  year: number
  /** Everything that will be destroyed, zero-count rows omitted. */
  losses: { label: string; count: number }[]
  amountOwed: number
  amountPaid: number
  warnings: string[]
}

/** Read-only description of what deleting this reunion would destroy. */
export async function previewReunionDeletion(
  reunionId: string
): Promise<ReunionDeletionPreview> {
  await requireAdmin()
  const service = createServiceClient()

  const { data: reunion, error } = await service
    .from('reunions')
    .select('id, name, year')
    .eq('id', reunionId)
    .single()
  if (error || !reunion) throw new Error('That reunion no longer exists.')

  const countFor = async (table: string, column: string): Promise<number> => {
    const { count } = await service
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, reunionId)
    return count ?? 0
  }

  const { count: signupCount } = await service
    .from('signups')
    .select('id, sub_event:sub_event_id!inner(reunion_id)', { count: 'exact', head: true })
    .eq('sub_event.reunion_id', reunionId)

  const [subEvents, announcements, invitations, surveys, photos, messages, timelineItems] =
    await Promise.all([
      countFor('sub_events', 'reunion_id'),
      countFor('announcements', 'reunion_id'),
      countFor('invitations', 'reunion_id'),
      countFor('surveys', 'reunion_id'),
      countFor('photos', 'reunion_id'),
      countFor('messages', 'reunion_id'),
      countFor('reunion_timeline_items', 'reunion_id'),
    ])

  const { data: balanceRows } = await service
    .from('balances')
    .select('amount_owed, amount_paid')
    .eq('reunion_id', reunionId)

  const balances = (balanceRows ?? []) as { amount_owed: number; amount_paid: number }[]
  const amountOwed = balances.reduce((sum, b) => sum + Number(b.amount_owed ?? 0), 0)
  const amountPaid = balances.reduce((sum, b) => sum + Number(b.amount_paid ?? 0), 0)

  const losses = [
    { label: 'Events', count: subEvents },
    { label: 'Event signups', count: signupCount ?? 0 },
    { label: 'Balance records', count: balances.length },
    { label: 'Announcements', count: announcements },
    { label: 'Invitations', count: invitations },
    { label: 'Surveys', count: surveys },
    { label: 'Photos', count: photos },
    { label: 'Chat messages', count: messages },
    { label: 'Timeline items', count: timelineItems },
  ].filter((l) => l.count > 0)

  const warnings: string[] = []

  if (amountPaid > 0) {
    warnings.push(
      `$${amountPaid.toFixed(2)} is recorded as paid across ${balances.length} balance${balances.length === 1 ? '' : 's'}. Deleting the reunion destroys those payment records — reconcile against Stripe first if you need the history.`
    )
  }
  if (photos > 0) {
    warnings.push(
      `${photos} photo${photos === 1 ? '' : 's'} will be deleted from storage as well as the database. There is no way to get them back.`
    )
  }

  return {
    id: reunion.id as string,
    name: reunion.name as string,
    year: reunion.year as number,
    losses,
    amountOwed,
    amountPaid,
    warnings,
  }
}

export type ReunionDeletionOutcome = {
  name: string
  losses: { label: string; count: number }[]
  photosRemoved: number
  /** Set when the rows went but some image files could not be swept. */
  storageWarning: string | null
}

/**
 * Permanently deletes a reunion.
 *
 * The rows go through the delete_reunion Postgres function, which returns the
 * photo storage paths on its way out — the photos table cascades, so once the
 * transaction commits there is nothing left to tell us which files belonged to
 * this reunion. The bucket sweep therefore has to run afterwards using that
 * list, and a failure there leaves orphaned files rather than a half-deleted
 * reunion.
 */
export async function deleteReunion(
  reunionId: string,
  confirmName: string
): Promise<ReunionDeletionOutcome> {
  await requireAdmin()

  const supabase = await createClient()
  const service = createServiceClient()

  const { data: reunion } = await service
    .from('reunions')
    .select('name')
    .eq('id', reunionId)
    .single()
  if (!reunion) throw new Error('That reunion no longer exists.')

  if (confirmName.trim().toLowerCase() !== String(reunion.name).trim().toLowerCase()) {
    throw new Error(`Type "${reunion.name}" exactly to confirm.`)
  }

  const { data, error } = await supabase.rpc('delete_reunion', { p_reunion: reunionId })
  if (error) throw new Error(error.message)

  const report = (data ?? {}) as Record<string, unknown>

  const losses = [
    { label: 'Events', count: Number(report.sub_events ?? 0) },
    { label: 'Event signups', count: Number(report.signups ?? 0) },
    { label: 'Balance records', count: Number(report.balances ?? 0) },
    { label: 'Announcements', count: Number(report.announcements ?? 0) },
    { label: 'Invitations', count: Number(report.invitations ?? 0) },
    { label: 'Surveys', count: Number(report.surveys ?? 0) },
    { label: 'Survey responses', count: Number(report.survey_responses ?? 0) },
    { label: 'Photos', count: Number(report.photos ?? 0) },
    { label: 'Chat messages', count: Number(report.messages ?? 0) },
    { label: 'Timeline items', count: Number(report.timeline_items ?? 0) },
  ].filter((l) => l.count > 0)

  const paths = Array.isArray(report.storage_paths)
    ? (report.storage_paths as unknown[]).filter(
        (p): p is string => typeof p === 'string' && p.length > 0
      )
    : []

  let photosRemoved = 0
  const storageErrors: string[] = []

  for (let i = 0; i < paths.length; i += STORAGE_BATCH_SIZE) {
    const batch = paths.slice(i, i + STORAGE_BATCH_SIZE)
    const { error: storageError } = await service.storage.from('photos').remove(batch)
    if (storageError) {
      storageErrors.push(storageError.message)
    } else {
      photosRemoved += batch.length
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/directory')

  return {
    name: String(report.deleted_name ?? reunion.name),
    losses,
    photosRemoved,
    storageWarning:
      storageErrors.length > 0
        ? `The reunion was deleted, but ${paths.length - photosRemoved} photo file${paths.length - photosRemoved === 1 ? '' : 's'} could not be removed from storage (${storageErrors[0]}). They are no longer visible in the app but still take up space.`
        : null,
  }
}
