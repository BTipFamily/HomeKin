// Pure validation/normalization for the directory spreadsheet importer.
// Deliberately free of Supabase imports so it can be unit-tested directly.

import { toCsv } from '@/lib/csv'
import { parseBirthDate, parseDateInput } from '@/lib/birthday'
import type {
  Gender,
  ParentChildKind,
  PartnerStatus,
  Role,
  VisibilitySettings,
} from '@/types/database'

export const MAX_IMPORT_ROWS = 500
// Kept comfortably under serverActions.bodySizeLimit in next.config.ts so an
// oversized file gets our message rather than an opaque framework error.
export const MAX_IMPORT_BYTES = 3_000_000 // 3 MB

export const IMPORT_COLUMNS = [
  'external_id',
  'name',
  'email',
  'phone',
  'address',
  'family_branch',
  'date_of_birth',
  'gender',
  'bio',
  'role',
  'photo_url',
  'facebook',
  'instagram',
  'linkedin',
  // Who can see each sensitive field. Left blank, each falls back to the
  // column default rather than being forced to a guess.
  'visibility_phone',
  'visibility_address',
  'visibility_email',
  'visibility_date_of_birth',
  'parent_1',
  'parent_2',
  'parent_kind',
  'spouse',
  'spouse_status',
  'spouse_start_date',
  'spouse_end_date',
] as const

export type ImportColumn = (typeof IMPORT_COLUMNS)[number]

const PARENT_KINDS: ParentChildKind[] = ['biological', 'step', 'adoptive', 'foster']
const PARTNER_STATUSES: PartnerStatus[] = [
  'married',
  'divorced',
  'separated',
  'partnered',
  'widowed',
  'engaged',
]
const ROLES: Role[] = ['member', 'committee', 'admin']
type Visibility = NonNullable<VisibilitySettings['phone']>
const VISIBILITIES: Visibility[] = ['members', 'committee', 'none']

/** Import column -> the key it sets inside visibility_settings. */
const VISIBILITY_COLUMNS = {
  visibility_phone: 'phone',
  visibility_address: 'address',
  visibility_email: 'email',
  visibility_date_of_birth: 'date_of_birth',
} as const satisfies Record<string, keyof VisibilitySettings>

/**
 * Mirrors the column default in the members table.
 *
 * visibility_settings is a single jsonb value, so writing only the keys a file
 * mentioned would drop the rest — and a missing key reads as "nobody can see
 * it". Setting one column would therefore quietly hide three other fields, so
 * anything specified is merged over this.
 */
export const DEFAULT_VISIBILITY: VisibilitySettings = {
  phone: 'members',
  address: 'members',
  email: 'members',
  date_of_birth: 'members',
}

/**
 * Sample rows shipped in the template: a two-generation family with a married
 * couple. Keyed by column name so adding a column can't silently shift the
 * values in every row.
 */
const TEMPLATE_EXAMPLE_ROWS: Partial<Record<ImportColumn, string>>[] = [
  {
    external_id: '1',
    name: 'Joe Smith',
    email: 'joe.smith@example.com',
    phone: '555-0101',
    address: '123 Main St, Atlanta, GA',
    family_branch: 'Smith',
    date_of_birth: '1950-03-02',
    gender: 'male',
    bio: 'Family patriarch.',
    role: 'member',
    photo_url: 'https://example.com/photos/joe.jpg',
    visibility_phone: 'members',
    visibility_date_of_birth: 'committee',
    spouse: '2',
    spouse_status: 'married',
    spouse_start_date: '1975-06-14',
  },
  {
    external_id: '2',
    name: 'Rose Smith',
    email: 'rose.smith@example.com',
    phone: '555-0102',
    address: '123 Main St, Atlanta, GA',
    family_branch: 'Smith',
    date_of_birth: '1952-11-19',
    gender: 'female',
    role: 'member',
    spouse: '1',
    spouse_status: 'married',
    spouse_start_date: '1975-06-14',
  },
  {
    external_id: '3',
    name: 'Alice Smith',
    email: 'alice.smith@example.com',
    family_branch: 'Smith',
    date_of_birth: '1980-07-30',
    gender: 'female',
    role: 'member',
    parent_1: '1',
    parent_2: '2',
    parent_kind: 'biological',
  },
]

export const TEMPLATE_CSV = toCsv([
  [...IMPORT_COLUMNS],
  ...TEMPLATE_EXAMPLE_ROWS.map((row) => IMPORT_COLUMNS.map((col) => row[col] ?? '')),
])

export type ImportIssue = {
  /** 1-based row number as it appears in the spreadsheet (header is row 1). */
  row: number
  column?: ImportColumn
  message: string
}

export type ParsedPerson = {
  row: number
  externalId: string | null
  name: string
  email: string
  phone: string | null
  address: string | null
  familyBranch: string | null
  /** ISO date (YYYY-MM-DD). */
  dateOfBirth: string | null
  gender: Gender | null
  bio: string | null
  role: Role
  photoUrl: string | null
  socialLinks: { facebook: string | null; instagram: string | null; linkedin: string | null }
  /**
   * The complete settings to write, or null when the file mentioned none — in
   * which case the row inherits the column default rather than having one
   * imposed on it.
   */
  visibilitySettings: VisibilitySettings | null
  /** True when a member with this email already exists — the row is skipped. */
  alreadyExists: boolean
}

export type PlannedRelationship =
  | {
      type: 'parent_child'
      /** Email of the parent (resolves to member_id). */
      parentEmail: string
      /** Email of the child (resolves to related_member_id). */
      childEmail: string
      kind: ParentChildKind
    }
  | {
      type: 'partner'
      memberEmail: string
      partnerEmail: string
      status: PartnerStatus
      startDate: string | null
      endDate: string | null
    }

export type ImportPlan = {
  people: ParsedPerson[]
  relationships: PlannedRelationship[]
  /** Blocking problems — the import cannot run while any exist. */
  errors: ImportIssue[]
  /** Non-blocking notes (e.g. a role downgrade). */
  warnings: ImportIssue[]
  summary: {
    totalRows: number
    toCreate: number
    toSkip: number
    relationships: number
  }
}

export type ExistingMember = { id: string; email: string }

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

// Intentionally permissive: we only reject shapes that clearly aren't addresses,
// since the DB has no format constraint and over-strict regexes reject valid mail.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Photos are rendered with next/image against a remotePatterns allow-list, and
 * a javascript: or data: URL in an href is worth refusing outright, so only
 * http(s) is accepted.
 */
function parseUrl(value: string): { url: string } | { error: string } {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { error: `"${value}" is not a valid web address.` }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: `"${value}" must start with http:// or https://.` }
  }
  return { url: parsed.toString() }
}

function mapHeader(headerRow: string[]): {
  index: Partial<Record<ImportColumn, number>>
  unknown: string[]
} {
  const index: Partial<Record<ImportColumn, number>> = {}
  const unknown: string[] = []

  headerRow.forEach((raw, i) => {
    const key = raw.trim().toLowerCase().replace(/\s+/g, '_')
    if ((IMPORT_COLUMNS as readonly string[]).includes(key)) {
      index[key as ImportColumn] = i
    } else if (key) {
      unknown.push(raw.trim())
    }
  })

  return { index, unknown }
}

/**
 * Validates and normalizes parsed CSV rows into an importable plan.
 *
 * @param rows       Grid from parseCsv, including the header row.
 * @param existing   Members already in the directory (used to skip duplicates
 *                   and to resolve relationship references to people not in the file).
 * @param options    importerIsAdmin gates whether the `role` column is honored.
 */
export function buildImportPlan(
  rows: string[][],
  existing: ExistingMember[],
  options: { importerIsAdmin: boolean }
): ImportPlan {
  const errors: ImportIssue[] = []
  const warnings: ImportIssue[] = []

  const emptyPlan = (): ImportPlan => ({
    people: [],
    relationships: [],
    errors,
    warnings,
    summary: { totalRows: 0, toCreate: 0, toSkip: 0, relationships: 0 },
  })

  if (rows.length === 0) {
    errors.push({ row: 1, message: 'The file is empty.' })
    return emptyPlan()
  }

  const { index, unknown } = mapHeader(rows[0])
  for (const col of unknown) {
    warnings.push({ row: 1, message: `Unrecognized column "${col}" was ignored.` })
  }
  if (index.name === undefined || index.email === undefined) {
    errors.push({
      row: 1,
      message:
        'The header row must include at least "name" and "email". Download the template to get the expected columns.',
    })
    return emptyPlan()
  }

  const dataRows = rows.slice(1)
  if (dataRows.length === 0) {
    errors.push({ row: 1, message: 'The file has a header but no data rows.' })
    return emptyPlan()
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    errors.push({
      row: 1,
      message: `This file has ${dataRows.length} rows. Please split it into files of ${MAX_IMPORT_ROWS} rows or fewer.`,
    })
    return emptyPlan()
  }

  const cell = (row: string[], col: ImportColumn): string => {
    const i = index[col]
    if (i === undefined) return ''
    return (row[i] ?? '').trim()
  }

  const existingByEmail = new Map(existing.map((m) => [normalizeEmail(m.email), m]))

  // ---- Pass 1: people ----
  const people: ParsedPerson[] = []
  const seenEmails = new Map<string, number>()
  const seenExternalIds = new Map<string, number>()
  /** Reference key (external_id or email, lowercased) -> row's email. */
  const refToEmail = new Map<string, string>()
  const rowsWithErrors = new Set<number>()

  dataRows.forEach((raw, i) => {
    const rowNum = i + 2 // header is row 1
    const fail = (message: string, column?: ImportColumn) => {
      errors.push({ row: rowNum, column, message })
      rowsWithErrors.add(rowNum)
    }

    const name = cell(raw, 'name')
    const email = normalizeEmail(cell(raw, 'email'))

    if (!name) fail('Name is required.', 'name')
    if (!email) {
      fail('Email is required — it is how this person later claims their profile.', 'email')
    } else if (!EMAIL_RE.test(email)) {
      fail(`"${email}" is not a valid email address.`, 'email')
    } else if (seenEmails.has(email)) {
      fail(`Duplicate email — already used on row ${seenEmails.get(email)}.`, 'email')
    } else {
      seenEmails.set(email, rowNum)
    }

    const externalId = cell(raw, 'external_id')
    if (externalId) {
      const key = externalId.toLowerCase()
      if (seenExternalIds.has(key)) {
        fail(`Duplicate external_id — already used on row ${seenExternalIds.get(key)}.`, 'external_id')
      } else {
        seenExternalIds.set(key, rowNum)
        if (email) refToEmail.set(key, email)
      }
    }
    if (email) refToEmail.set(email, email)

    const dobRaw = cell(raw, 'date_of_birth')
    let dateOfBirth: string | null = null
    if (dobRaw) {
      const parsed = parseBirthDate(dobRaw)
      if ('error' in parsed) {
        fail(`Date of birth ${parsed.error}`, 'date_of_birth')
      } else {
        dateOfBirth = parsed.iso
      }
    }

    const genderRaw = cell(raw, 'gender').toLowerCase()
    let gender: Gender | null = null
    if (genderRaw) {
      if (genderRaw === 'male' || genderRaw === 'female') {
        gender = genderRaw
      } else {
        fail(`Gender must be "male" or "female" (got "${genderRaw}").`, 'gender')
      }
    }

    const roleRaw = cell(raw, 'role').toLowerCase()
    let role: Role = 'member'
    if (roleRaw) {
      if ((ROLES as string[]).includes(roleRaw)) {
        role = roleRaw as Role
      } else {
        fail(`Role must be one of ${ROLES.join(', ')} (got "${roleRaw}").`, 'role')
      }
    }
    if (role !== 'member' && !options.importerIsAdmin) {
      warnings.push({
        row: rowNum,
        column: 'role',
        message: `Only an admin can assign the "${role}" role — importing this person as a regular member.`,
      })
      role = 'member'
    }

    const photoRaw = cell(raw, 'photo_url')
    let photoUrl: string | null = null
    if (photoRaw) {
      const parsed = parseUrl(photoRaw)
      if ('error' in parsed) fail(`Photo URL ${parsed.error}`, 'photo_url')
      else photoUrl = parsed.url
    }

    // Only the keys the file set, so unspecified fields keep the DB default.
    const visibilitySettings: Partial<VisibilitySettings> = {}
    for (const [column, key] of Object.entries(VISIBILITY_COLUMNS)) {
      const value = cell(raw, column as ImportColumn).toLowerCase()
      if (!value) continue
      if ((VISIBILITIES as string[]).includes(value)) {
        visibilitySettings[key] = value as Visibility
      } else {
        fail(
          `${column} must be one of ${VISIBILITIES.join(', ')} (got "${value}").`,
          column as ImportColumn
        )
      }
    }

    people.push({
      row: rowNum,
      externalId: externalId || null,
      name,
      email,
      phone: cell(raw, 'phone') || null,
      address: cell(raw, 'address') || null,
      familyBranch: cell(raw, 'family_branch') || null,
      dateOfBirth,
      gender,
      bio: cell(raw, 'bio') || null,
      role,
      photoUrl,
      socialLinks: {
        facebook: cell(raw, 'facebook') || null,
        instagram: cell(raw, 'instagram') || null,
        linkedin: cell(raw, 'linkedin') || null,
      },
      visibilitySettings:
        Object.keys(visibilitySettings).length > 0
          ? { ...DEFAULT_VISIBILITY, ...visibilitySettings }
          : null,
      alreadyExists: email ? existingByEmail.has(email) : false,
    })
  })

  // Existing directory members are also valid relationship targets.
  for (const m of existing) {
    const key = normalizeEmail(m.email)
    if (!refToEmail.has(key)) refToEmail.set(key, key)
  }

  // ---- Pass 2: relationships ----
  const relationships: PlannedRelationship[] = []
  const seenParentEdges = new Set<string>()
  const seenPartnerEdges = new Set<string>()

  dataRows.forEach((raw, i) => {
    const rowNum = i + 2
    const person = people[i]
    // Skip relationship wiring for rows that already failed — their email
    // (the join key) may be missing or invalid.
    if (rowsWithErrors.has(rowNum) || !person?.email) return

    const fail = (message: string, column?: ImportColumn) =>
      errors.push({ row: rowNum, column, message })

    const resolve = (value: string, column: ImportColumn): string | null => {
      const key = value.toLowerCase()
      const target = refToEmail.get(key) ?? refToEmail.get(normalizeEmail(value))
      if (!target) {
        fail(
          `Could not find "${value}" — it must match another row's external_id or email, or an existing member's email.`,
          column
        )
        return null
      }
      if (target === person.email) {
        fail(`"${value}" refers to this same person.`, column)
        return null
      }
      return target
    }

    // -- parents --
    const parentKindRaw = cell(raw, 'parent_kind').toLowerCase()
    let parentKind: ParentChildKind = 'biological'
    if (parentKindRaw) {
      if ((PARENT_KINDS as string[]).includes(parentKindRaw)) {
        parentKind = parentKindRaw as ParentChildKind
      } else {
        fail(`parent_kind must be one of ${PARENT_KINDS.join(', ')} (got "${parentKindRaw}").`, 'parent_kind')
      }
    }

    const parentRefs: { value: string; column: ImportColumn }[] = []
    const p1 = cell(raw, 'parent_1')
    const p2 = cell(raw, 'parent_2')
    if (p1) parentRefs.push({ value: p1, column: 'parent_1' })
    if (p2) parentRefs.push({ value: p2, column: 'parent_2' })

    const resolvedParents: string[] = []
    for (const ref of parentRefs) {
      const parentEmail = resolve(ref.value, ref.column)
      if (!parentEmail) continue
      if (resolvedParents.includes(parentEmail)) {
        fail(`"${ref.value}" is listed as a parent twice.`, ref.column)
        continue
      }
      resolvedParents.push(parentEmail)

      const edgeKey = `${parentEmail}|${person.email}`
      if (seenParentEdges.has(edgeKey)) continue
      seenParentEdges.add(edgeKey)
      relationships.push({
        type: 'parent_child',
        parentEmail,
        childEmail: person.email,
        kind: parentKind,
      })
    }

    // -- spouse --
    const spouseRef = cell(raw, 'spouse')
    if (!spouseRef) return

    const spouseEmail = resolve(spouseRef, 'spouse')
    if (!spouseEmail) return

    const statusRaw = cell(raw, 'spouse_status').toLowerCase()
    let status: PartnerStatus = 'married'
    if (statusRaw) {
      if ((PARTNER_STATUSES as string[]).includes(statusRaw)) {
        status = statusRaw as PartnerStatus
      } else {
        fail(
          `spouse_status must be one of ${PARTNER_STATUSES.join(', ')} (got "${statusRaw}").`,
          'spouse_status'
        )
        return
      }
    }

    const readDate = (column: 'spouse_start_date' | 'spouse_end_date'): string | null | 'invalid' => {
      const value = cell(raw, column)
      if (!value) return null
      const parsed = parseDateInput(value)
      if ('error' in parsed) {
        fail(`${column} ${parsed.error}`, column)
        return 'invalid'
      }
      return parsed.iso
    }

    const startDate = readDate('spouse_start_date')
    const endDate = readDate('spouse_end_date')
    if (startDate === 'invalid' || endDate === 'invalid') return

    // Partner edges are symmetric but stored as one directed row, so a couple
    // listing each other should yield a single relationship.
    const pairKey = [person.email, spouseEmail].sort().join('|')
    if (seenPartnerEdges.has(pairKey)) return
    seenPartnerEdges.add(pairKey)

    relationships.push({
      type: 'partner',
      memberEmail: person.email,
      partnerEmail: spouseEmail,
      status,
      startDate,
      endDate,
    })
  })

  const toSkip = people.filter((p) => p.alreadyExists).length

  return {
    people,
    relationships,
    errors,
    warnings,
    summary: {
      totalRows: people.length,
      toCreate: people.length - toSkip,
      toSkip,
      relationships: relationships.length,
    },
  }
}
