'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  findDuplicatePairs,
  previewFieldOutcomes,
  willAdoptLogin,
  willOrphanLogin,
  type DuplicatePair,
  type FieldOutcome,
  type MergeCandidate,
} from '@/lib/member-merge'

/** Columns the matcher and preview need — kept in one place so both agree. */
const CANDIDATE_COLUMNS =
  'id, name, email, phone, address, family_branch, date_of_birth, bio, photo_url, gender, role, social_links, auth_user_id, created_by_proxy, created_at'

async function requireAdmin(): Promise<{ id: string }> {
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

  if (!member || member.role !== 'admin') throw new Error('Admin access required')
  return { id: member.id }
}

/** Candidate duplicate pairs across the whole directory, best match first. */
export async function findDuplicateMembers(): Promise<DuplicatePair[]> {
  await requireAdmin()

  const service = createServiceClient()
  const { data, error } = await service.from('members').select(CANDIDATE_COLUMNS).order('name')
  if (error) throw new Error(error.message)

  return findDuplicatePairs((data ?? []) as MergeCandidate[])
}

export type MergePreview = {
  keep: MergeCandidate
  remove: MergeCandidate
  fields: FieldOutcome[]
  /** What moves across, for the "here's what happens" list. */
  moves: { label: string; count: number }[]
  /** Non-blocking things the admin should see first. */
  warnings: string[]
  /** Blocking problems — the merge cannot run while any exist. */
  blockers: string[]
}

async function loadCandidate(id: string): Promise<MergeCandidate> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('members')
    .select(CANDIDATE_COLUMNS)
    .eq('id', id)
    .single()
  if (error || !data) throw new Error('That member no longer exists.')
  return data as MergeCandidate
}

/**
 * Read-only description of what merging `removeId` into `keepId` would do.
 *
 * The blocker check mirrors the one inside merge_members. The function is the
 * authority — it re-checks under a row lock — but repeating it here means the
 * admin sees the problem before committing rather than as an error afterwards.
 */
export async function previewMemberMerge(
  keepId: string,
  removeId: string
): Promise<MergePreview> {
  await requireAdmin()
  if (keepId === removeId) throw new Error('Pick two different profiles to merge.')

  const [keep, remove] = await Promise.all([loadCandidate(keepId), loadCandidate(removeId)])
  const service = createServiceClient()

  const countFor = async (
    table: string,
    column: string
  ): Promise<number> => {
    const { count, error } = await service
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, removeId)
    if (error) throw new Error(error.message)
    return count ?? 0
  }

  const [
    signups,
    balances,
    surveyResponses,
    invitations,
    photosUploaded,
    messages,
    relationshipsOut,
    relationshipsIn,
  ] = await Promise.all([
    countFor('signups', 'member_id'),
    countFor('balances', 'member_id'),
    countFor('survey_responses', 'member_id'),
    countFor('invitations', 'member_id'),
    countFor('photos', 'uploaded_by'),
    countFor('messages', 'sender_id'),
    countFor('relationships', 'member_id'),
    countFor('relationships', 'related_member_id'),
  ])

  const moves = [
    { label: 'Event signups', count: signups },
    { label: 'Balances', count: balances },
    { label: 'Family relationships', count: relationshipsOut + relationshipsIn },
    { label: 'Survey responses', count: surveyResponses },
    { label: 'Invitations', count: invitations },
    { label: 'Photos uploaded', count: photosUploaded },
    { label: 'Chat messages', count: messages },
  ].filter((m) => m.count > 0)

  const warnings: string[] = []
  const blockers: string[] = []

  if (willAdoptLogin(keep, remove)) {
    warnings.push(
      `${keep.name} will take over the login for ${remove.email}, so they keep signing in exactly as they do today.`
    )
  }
  if (willOrphanLogin(keep, remove)) {
    warnings.push(
      `Both profiles have their own login. Only the one for ${keep.email} survives — whoever has been signing in as ${remove.email} will not be able to get in afterwards without being re-invited.`
    )
  }

  // Balances against the same sub-event: the one case merge_members refuses.
  const { data: removeBalances, error: rbError } = await service
    .from('balances')
    .select('reunion_id, sub_event_id, sub_event:sub_event_id(name)')
    .eq('member_id', removeId)
  if (rbError) throw new Error(rbError.message)

  const { data: keepBalances, error: kbError } = await service
    .from('balances')
    .select('reunion_id, sub_event_id')
    .eq('member_id', keepId)
  if (kbError) throw new Error(kbError.message)

  type BalanceKey = { reunion_id: string; sub_event_id: string | null }
  type RemovedBalance = BalanceKey & { sub_event?: { name?: string } | null }

  const balanceKey = (b: BalanceKey) => `${b.reunion_id}|${b.sub_event_id ?? 'general'}`

  const keepKeys = new Set(((keepBalances ?? []) as BalanceKey[]).map(balanceKey))
  const clashing = ((removeBalances ?? []) as unknown as RemovedBalance[]).filter((b) =>
    keepKeys.has(balanceKey(b))
  )

  if (clashing.length > 0) {
    const names = [...new Set(clashing.map((b) => b.sub_event?.name ?? 'General Fund'))]
    blockers.push(
      `Both profiles have a balance for ${names.join(', ')}. Money is never combined automatically — settle or delete one of those balances, then come back.`
    )
  }

  if (remove.role === 'admin' && keep.role !== 'admin') {
    warnings.push(
      `${remove.name} is an admin, so the merged profile will be an admin too.`
    )
  }

  return {
    keep,
    remove,
    fields: previewFieldOutcomes(keep, remove),
    moves,
    warnings,
    blockers,
  }
}

export type MergeOutcome = {
  keptId: string
  removedName: string
  removedEmail: string
  adoptedLogin: boolean
  orphanedLogin: boolean
  counts: { label: string; count: number }[]
}

const REPORT_LABELS: Record<string, string> = {
  signups_moved: 'Event signups moved',
  signups_duplicate_dropped: 'Duplicate signups removed',
  balances_moved: 'Balances moved',
  relationships_moved: 'Family relationships moved',
  relationships_self_dropped: 'Self-relationships removed',
  relationships_duplicate_dropped: 'Duplicate relationships removed',
  survey_responses_moved: 'Survey responses moved',
  survey_responses_dropped: 'Duplicate survey responses removed',
  invitations_moved: 'Invitations moved',
  photos_retagged: 'Photos re-tagged',
}

/**
 * Performs the merge. All the work happens inside the merge_members Postgres
 * function so it lands as one transaction — a partial merge would scatter rows
 * across tables with no way to tell which profile they came from.
 *
 * Called with the caller's own session (not the service client) because the
 * function reads auth.uid() to check for the admin role.
 */
export async function mergeMembers(keepId: string, removeId: string): Promise<MergeOutcome> {
  await requireAdmin()
  if (keepId === removeId) throw new Error('Pick two different profiles to merge.')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('merge_members', {
    p_source: removeId,
    p_target: keepId,
  })

  if (error) throw new Error(error.message)

  const report = (data ?? {}) as Record<string, unknown>
  const counts = Object.entries(REPORT_LABELS)
    .map(([key, label]) => ({ label, count: Number(report[key] ?? 0) }))
    .filter((entry) => entry.count > 0)

  revalidatePath('/directory')
  revalidatePath('/family-tree')
  revalidatePath('/admin/members')
  revalidatePath('/admin/members/merge')
  revalidatePath(`/directory/${keepId}`)

  return {
    keptId: keepId,
    removedName: String(report.removed_name ?? 'that profile'),
    removedEmail: String(report.removed_email ?? ''),
    adoptedLogin: report.adopted_login === true,
    orphanedLogin: report.orphaned_login === true,
    counts,
  }
}
