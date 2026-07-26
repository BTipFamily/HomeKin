// Finding likely duplicate member profiles, and previewing what a merge would
// do to the surviving one.
//
// Nothing here writes: it ranks candidate pairs for an admin to confirm, and
// mirrors the field-folding rules in the merge_members SQL function so the
// preview matches what actually happens. Deliberately free of Supabase imports
// so it can be unit-tested directly.

import type { Member, Role, SocialLinks } from '@/types/database'

/** The subset of a profile the matcher and the preview need. */
export type MergeCandidate = Pick<
  Member,
  | 'id'
  | 'name'
  | 'email'
  | 'phone'
  | 'address'
  | 'family_branch'
  | 'date_of_birth'
  | 'bio'
  | 'photo_url'
  | 'gender'
  | 'role'
  | 'social_links'
  | 'auth_user_id'
  | 'created_by_proxy'
  | 'created_at'
>

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizeEmail(email: string | null): string {
  return (email ?? '').trim().toLowerCase()
}

/**
 * Collapses the addresses a mail provider treats as one inbox: Gmail ignores
 * dots in the local part, and everything after a `+` is a tag. This is what
 * catches `joe.smith@gmail.com` signing up as `joesmith+reunion@gmail.com`.
 */
export function canonicalEmail(email: string | null): string {
  const normalized = normalizeEmail(email)
  const at = normalized.lastIndexOf('@')
  if (at < 1) return normalized

  let local = normalized.slice(0, at)
  const domain = normalized.slice(at + 1)

  const plus = local.indexOf('+')
  if (plus > 0) local = local.slice(0, plus)
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '')
    return `${local}@gmail.com`
  }
  return `${local}@${domain}`
}

/**
 * Generational suffixes are load-bearing in a family directory — a Jr and a Sr
 * are two people who share a name, which is the opposite of a duplicate — so
 * they are pulled out and compared separately rather than normalized away.
 */
const SUFFIX_RE = /\b(jr|sr|ii|iii|iv|v)\.?$/i

export function splitNameSuffix(name: string | null): { base: string; suffix: string } {
  const cleaned = (name ?? '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const match = cleaned.match(SUFFIX_RE)
  if (!match) return { base: cleaned, suffix: '' }
  return {
    base: cleaned.slice(0, match.index).trim(),
    suffix: match[1].toLowerCase(),
  }
}

export function normalizeName(name: string | null): string {
  return splitNameSuffix(name).base
}

/** Digits only, with the US country code dropped so 1-555… matches 555…. */
export function normalizePhone(phone: string | null): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

// ---------------------------------------------------------------------------
// Pair scoring
// ---------------------------------------------------------------------------

export type DuplicatePair = {
  /** The profile suggested to keep. */
  keep: MergeCandidate
  /** The profile suggested to merge away. */
  remove: MergeCandidate
  /** 0-100. Higher means more likely to be the same person. */
  score: number
  reasons: string[]
}

/** Below this a pair is too speculative to be worth an admin's attention. */
export const MIN_DUPLICATE_SCORE = 50

/** How many non-empty fields a profile carries — used to pick which to keep. */
export function completeness(member: MergeCandidate): number {
  const links = (member.social_links ?? {}) as SocialLinks
  const fields = [
    member.phone,
    member.address,
    member.family_branch,
    member.date_of_birth,
    member.bio,
    member.photo_url,
    member.gender,
    links.facebook,
    links.instagram,
    links.linkedin,
  ]
  return fields.filter((f) => f !== null && f !== undefined && String(f).trim() !== '').length
}

/**
 * Which of a pair should survive. The richer profile wins, because merging
 * only fills blanks on the survivor and never overwrites; ties go to the older
 * record, which is the one other rows are most likely to already reference.
 */
function pickKeeper(a: MergeCandidate, b: MergeCandidate): [MergeCandidate, MergeCandidate] {
  const byCompleteness = completeness(b) - completeness(a)
  if (byCompleteness !== 0) return byCompleteness > 0 ? [b, a] : [a, b]

  const aTime = Date.parse(a.created_at ?? '')
  const bTime = Date.parse(b.created_at ?? '')
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return aTime < bTime ? [a, b] : [b, a]
  }
  return [a, b]
}

/**
 * Scores one pair. Returns null when the two are positively distinguishable —
 * a mismatched suffix or two different birth dates mean these are two people
 * who merely look alike, and surfacing them invites a destructive mistake.
 */
export function scorePair(a: MergeCandidate, b: MergeCandidate): DuplicatePair | null {
  if (a.id === b.id) return null

  const nameA = splitNameSuffix(a.name)
  const nameB = splitNameSuffix(b.name)

  // Jane Smith Jr and Jane Smith Sr are not the same person.
  if (nameA.suffix && nameB.suffix && nameA.suffix !== nameB.suffix) return null
  // Neither are two people with the same name and different birthdays.
  if (a.date_of_birth && b.date_of_birth && a.date_of_birth !== b.date_of_birth) return null

  const reasons: string[] = []
  let score = 0

  const sameEmail = normalizeEmail(a.email) === normalizeEmail(b.email)
  const sameCanonicalEmail = canonicalEmail(a.email) === canonicalEmail(b.email)
  const sameName = nameA.base !== '' && nameA.base === nameB.base
  const phoneA = normalizePhone(a.phone)
  const phoneB = normalizePhone(b.phone)
  const samePhone = phoneA !== '' && phoneA === phoneB
  const sameDob = !!a.date_of_birth && a.date_of_birth === b.date_of_birth
  const branchA = (a.family_branch ?? '').trim().toLowerCase()
  const sameBranch = branchA !== '' && branchA === (b.family_branch ?? '').trim().toLowerCase()

  if (sameEmail) {
    score = 100
    reasons.push('Same email address')
  } else if (sameCanonicalEmail) {
    score = 92
    reasons.push('Same email inbox, written differently')
  }

  if (sameName) {
    if (sameDob) {
      score = Math.max(score, 96)
      reasons.push('Same name and date of birth')
    } else if (samePhone) {
      score = Math.max(score, 90)
      reasons.push('Same name and phone number')
    } else if (sameBranch) {
      score = Math.max(score, 72)
      reasons.push('Same name and family branch')
    } else {
      score = Math.max(score, 55)
      reasons.push('Same name')
    }
  } else if (samePhone) {
    score = Math.max(score, 60)
    reasons.push('Same phone number')
  }

  // One profile claimed and one not is the signature of the invite-code case:
  // someone already in the directory signed up and got a second profile.
  if (score > 0 && a.created_by_proxy !== b.created_by_proxy) {
    score = Math.min(100, score + 4)
    reasons.push('One profile has been claimed, the other has not')
  }

  if (score < MIN_DUPLICATE_SCORE) return null

  const [keep, remove] = pickKeeper(a, b)
  return { keep, remove, score, reasons }
}

/**
 * All candidate duplicate pairs in the directory, best match first.
 *
 * O(n²) on purpose: a family directory is hundreds of rows, and blocking on a
 * key would miss exactly the pairs worth catching (same person, different
 * email and no phone on one side).
 */
export function findDuplicatePairs(members: MergeCandidate[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = []
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const pair = scorePair(members[i], members[j])
      if (pair) pairs.push(pair)
    }
  }
  return pairs.sort(
    (x, y) => y.score - x.score || x.keep.name.localeCompare(y.keep.name)
  )
}

// ---------------------------------------------------------------------------
// Merge preview
// ---------------------------------------------------------------------------

export type FieldOutcome = {
  field: string
  label: string
  keptValue: string | null
  removedValue: string | null
  /** What the surviving profile ends up with. */
  result: string | null
  /** True when the value is filled in from the profile being merged away. */
  filledFromRemoved: boolean
}

const ROLE_RANK: Record<Role, number> = { member: 0, committee: 1, admin: 2 }

/** The higher of two roles — merging never demotes anyone. */
export function mergeRole(a: Role, b: Role): Role {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === '' ? null : s
}

/**
 * What the surviving profile will look like afterwards. Mirrors the coalesce
 * rules in merge_members: the kept profile's value wins wherever it has one,
 * and blanks are filled from the profile being removed.
 */
export function previewFieldOutcomes(
  keep: MergeCandidate,
  remove: MergeCandidate
): FieldOutcome[] {
  const keepLinks = (keep.social_links ?? {}) as SocialLinks
  const removeLinks = (remove.social_links ?? {}) as SocialLinks

  const rows: { field: string; label: string; a: unknown; b: unknown }[] = [
    { field: 'name', label: 'Name', a: keep.name, b: remove.name },
    { field: 'email', label: 'Email', a: keep.email, b: remove.email },
    { field: 'phone', label: 'Phone', a: keep.phone, b: remove.phone },
    { field: 'address', label: 'Address', a: keep.address, b: remove.address },
    { field: 'family_branch', label: 'Family branch', a: keep.family_branch, b: remove.family_branch },
    { field: 'date_of_birth', label: 'Date of birth', a: keep.date_of_birth, b: remove.date_of_birth },
    { field: 'bio', label: 'Bio', a: keep.bio, b: remove.bio },
    { field: 'photo_url', label: 'Photo', a: keep.photo_url, b: remove.photo_url },
    { field: 'gender', label: 'Gender', a: keep.gender, b: remove.gender },
    { field: 'facebook', label: 'Facebook', a: keepLinks.facebook, b: removeLinks.facebook },
    { field: 'instagram', label: 'Instagram', a: keepLinks.instagram, b: removeLinks.instagram },
    { field: 'linkedin', label: 'LinkedIn', a: keepLinks.linkedin, b: removeLinks.linkedin },
  ]

  const outcomes: FieldOutcome[] = rows.map(({ field, label, a, b }) => {
    const keptValue = text(a)
    const removedValue = text(b)
    // Email is the one field the merge never fills in from the other side: the
    // surviving row keeps its own address, because that is the login identity
    // other people already have on file.
    const result = field === 'email' ? keptValue : keptValue ?? removedValue
    return {
      field,
      label,
      keptValue,
      removedValue,
      result,
      filledFromRemoved: field !== 'email' && keptValue === null && removedValue !== null,
    }
  })

  const role = mergeRole(keep.role, remove.role)
  outcomes.push({
    field: 'role',
    label: 'Role',
    keptValue: keep.role,
    removedValue: remove.role,
    result: role,
    filledFromRemoved: role !== keep.role,
  })

  return outcomes
}

/** True when the surviving profile will inherit the other one's login. */
export function willAdoptLogin(keep: MergeCandidate, remove: MergeCandidate): boolean {
  return !keep.auth_user_id && !!remove.auth_user_id
}

/**
 * True when both profiles have their own login. Only one can survive, so the
 * other account is left with no profile and has to be re-linked by hand.
 */
export function willOrphanLogin(keep: MergeCandidate, remove: MergeCandidate): boolean {
  return !!keep.auth_user_id && !!remove.auth_user_id
}
