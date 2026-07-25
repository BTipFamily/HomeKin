'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { parseCsv } from '@/lib/csv'
import { looksLikeLegacyXls, looksLikeZip, parseXlsx, XlsxError } from '@/lib/xlsx'
import {
  buildImportPlan,
  MAX_IMPORT_BYTES,
  type ImportPlan,
  type PlannedRelationship,
} from '@/lib/member-import'

const CHUNK_SIZE = 100

export type ImportResult = {
  membersCreated: number
  membersSkipped: number
  relationshipsCreated: number
  relationshipsSkipped: number
  /** Non-fatal problems hit while writing (a bad edge doesn't abort the import). */
  writeErrors: string[]
}

type Importer = { id: string; role: string; isAdmin: boolean }

async function requireImporter(): Promise<Importer> {
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
  return { id: member.id, role: member.role, isAdmin: member.role === 'admin' }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Reads the uploaded file into a grid, picking the parser by content rather
 * than by extension — a ".csv" that is really a workbook (a very easy mistake
 * to make in Excel's Save As dialog) still imports correctly.
 */
async function readUpload(formData: FormData): Promise<string[][]> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('No file was uploaded. Please choose a file and try again.')
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(
      `That file is too large (limit ${Math.round(MAX_IMPORT_BYTES / 1_000_000)} MB). Please split it into smaller files.`
    )
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  if (looksLikeLegacyXls(bytes)) {
    throw new Error(
      'That is an old-style .xls workbook, which we cannot read. Open it in Excel and use File → Save As to save it as .xlsx or .csv, then upload that.'
    )
  }

  if (looksLikeZip(bytes)) {
    try {
      return parseXlsx(bytes)
    } catch (e) {
      if (e instanceof XlsxError) throw new Error(e.message)
      throw new Error('We could not read that spreadsheet. Try saving it as CSV and uploading again.')
    }
  }

  const text = new TextDecoder('utf-8').decode(bytes)
  // A binary file that is neither ZIP nor OLE2 (a .numbers bundle, a PDF)
  // decodes to mojibake rather than throwing, so catch it here instead of
  // showing a baffling "missing name column" error further down. Real text can
  // carry the odd replacement character, so require a run of them.
  const REPLACEMENT_CHAR = '\uFFFD'
  if (text.split(REPLACEMENT_CHAR).length - 1 > 8) {
    throw new Error(
      'That file is not a spreadsheet we can read. Please upload a .xlsx or .csv file.'
    )
  }

  return parseCsv(text)
}

/**
 * Parses + validates the upload against the current directory without writing
 * anything. Powers the preview screen.
 */
export async function previewMemberImport(formData: FormData): Promise<ImportPlan> {
  const importer = await requireImporter()
  const grid = await readUpload(formData)

  const supabase = await createClient()
  const { data: existing, error } = await supabase.from('members').select('id, email')
  if (error) throw new Error(error.message)

  return buildImportPlan(grid, existing ?? [], {
    importerIsAdmin: importer.isAdmin,
  })
}

/**
 * Re-validates server-side (never trusting a client-supplied plan), then
 * creates the new members and their parent/partner relationships.
 */
export async function commitMemberImport(formData: FormData): Promise<ImportResult> {
  const importer = await requireImporter()
  const grid = await readUpload(formData)

  const supabase = await createClient()
  const { data: existingMembers, error: existingError } = await supabase
    .from('members')
    .select('id, email')
  if (existingError) throw new Error(existingError.message)

  const plan = buildImportPlan(grid, existingMembers ?? [], {
    importerIsAdmin: importer.isAdmin,
  })

  if (plan.errors.length > 0) {
    throw new Error(
      `This file still has ${plan.errors.length} problem${plan.errors.length === 1 ? '' : 's'} to fix. Re-check the preview.`
    )
  }

  const service = createServiceClient()
  const writeErrors: string[] = []

  // ---- 1. Insert new members ----
  const toCreate = plan.people.filter((p) => !p.alreadyExists)
  let membersCreated = 0

  for (const batch of chunk(toCreate, CHUNK_SIZE)) {
    const { error } = await service.from('members').insert(
      batch.map((p) => ({
        name: p.name,
        email: p.email,
        phone: p.phone,
        // Addresses import un-geocoded on purpose: geocoding is a serial
        // Mapbox call per member (see geocodeAddress). The next profile save
        // picks it up via the geocoded_address comparison in updateMemberProfile.
        address: p.address,
        family_branch: p.familyBranch,
        date_of_birth: p.dateOfBirth,
        gender: p.gender,
        bio: p.bio,
        role: p.role,
        social_links: p.socialLinks,
        created_by_proxy: true,
      }))
    )
    if (error) {
      writeErrors.push(`Failed to create a batch of ${batch.length} members: ${error.message}`)
    } else {
      membersCreated += batch.length
    }
  }

  // ---- 2. Map every referenced email to a member id ----
  const { data: allMembers, error: mapError } = await service.from('members').select('id, email')
  if (mapError) throw new Error(mapError.message)

  const idByEmail = new Map<string, string>()
  for (const m of allMembers ?? []) {
    idByEmail.set(m.email.trim().toLowerCase(), m.id)
  }

  // ---- 3. Insert relationships ----
  const memberIds = [...new Set(plan.people.map((p) => idByEmail.get(p.email)).filter(Boolean))] as string[]

  // Pull existing edges touching anyone in this import so a re-upload is a no-op.
  const existingEdges = new Set<string>()
  if (memberIds.length > 0) {
    const [asMember, asRelated] = await Promise.all([
      service
        .from('relationships')
        .select('member_id, related_member_id, relationship_type')
        .in('member_id', memberIds),
      service
        .from('relationships')
        .select('member_id, related_member_id, relationship_type')
        .in('related_member_id', memberIds),
    ])
    if (asMember.error) writeErrors.push(asMember.error.message)
    if (asRelated.error) writeErrors.push(asRelated.error.message)

    for (const edge of [...(asMember.data ?? []), ...(asRelated.data ?? [])]) {
      if (edge.relationship_type === 'partner') {
        // Symmetric: store under a direction-independent key.
        const key = [edge.member_id, edge.related_member_id].sort().join('|')
        existingEdges.add(`partner:${key}`)
      } else {
        existingEdges.add(
          `${edge.relationship_type}:${edge.member_id}|${edge.related_member_id}`
        )
      }
    }
  }

  type RelationshipRow = {
    member_id: string
    related_member_id: string
    relationship_type: string
    parent_child_kind?: string | null
    partner_status?: string | null
    partner_start_date?: string | null
    partner_end_date?: string | null
    created_by: string
  }

  const rows: RelationshipRow[] = []
  let relationshipsSkipped = 0

  const resolvePair = (rel: PlannedRelationship): [string, string] | null => {
    const a =
      rel.type === 'parent_child' ? idByEmail.get(rel.parentEmail) : idByEmail.get(rel.memberEmail)
    const b =
      rel.type === 'parent_child' ? idByEmail.get(rel.childEmail) : idByEmail.get(rel.partnerEmail)
    if (!a || !b || a === b) return null
    return [a, b]
  }

  for (const rel of plan.relationships) {
    const pair = resolvePair(rel)
    if (!pair) {
      relationshipsSkipped++
      continue
    }
    const [a, b] = pair

    const key =
      rel.type === 'partner'
        ? `partner:${[a, b].sort().join('|')}`
        : `parent_child:${a}|${b}`

    if (existingEdges.has(key)) {
      relationshipsSkipped++
      continue
    }
    existingEdges.add(key)

    if (rel.type === 'parent_child') {
      rows.push({
        member_id: a, // parent
        related_member_id: b, // child
        relationship_type: 'parent_child',
        parent_child_kind: rel.kind,
        created_by: importer.id,
      })
    } else {
      rows.push({
        member_id: a,
        related_member_id: b,
        relationship_type: 'partner',
        partner_status: rel.status,
        partner_start_date: rel.startDate,
        partner_end_date: rel.endDate,
        created_by: importer.id,
      })
    }
  }

  let relationshipsCreated = 0
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const { error } = await service.from('relationships').insert(batch)
    if (error) {
      writeErrors.push(`Failed to create a batch of ${batch.length} relationships: ${error.message}`)
    } else {
      relationshipsCreated += batch.length
    }
  }

  revalidatePath('/directory')
  revalidatePath('/family-tree')
  revalidatePath('/admin/members')

  return {
    membersCreated,
    membersSkipped: plan.summary.toSkip,
    relationshipsCreated,
    relationshipsSkipped,
    writeErrors,
  }
}
