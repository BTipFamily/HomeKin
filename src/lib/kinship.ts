import type { Gender, ParentChildKind, PartnerStatus, Relationship } from '@/types/database'

/**
 * Works out what one member is to another — "Aunt", "2nd cousin once removed",
 * "Father-in-law" — from the same `relationships` rows the family tree is built
 * from.
 *
 * Deliberately a pure function over an index rather than anything that touches
 * the database: the tree renders it on hover for every visible node, and the
 * profile page answers "how am I related to this person?" with the same call.
 */

/** Parent edges that count as lineage when walking ancestors. */
const LINEAGE_KINDS: ReadonlySet<ParentChildKind> = new Set(['biological', 'adoptive'])

/** Parent edges that make someone a step-relative rather than a blood one. */
const STEP_KINDS: ReadonlySet<ParentChildKind> = new Set(['step', 'foster'])

export type KinshipIndex = {
  /** child id -> parent id -> how that parent is related. */
  parentsOf: Map<string, Map<string, ParentChildKind | null>>
  /** parent id -> child id -> how that child is related. */
  childrenOf: Map<string, Map<string, ParentChildKind | null>>
  /** Symmetric: both directions of every partner edge are stored. */
  partnersOf: Map<string, Map<string, PartnerStatus | null>>
}

function ensure<V>(map: Map<string, Map<string, V>>, key: string): Map<string, V> {
  let inner = map.get(key)
  if (!inner) {
    inner = new Map()
    map.set(key, inner)
  }
  return inner
}

export function buildKinshipIndex(relationships: Relationship[]): KinshipIndex {
  const index: KinshipIndex = {
    parentsOf: new Map(),
    childrenOf: new Map(),
    partnersOf: new Map(),
  }

  for (const rel of relationships) {
    if (rel.relationship_type === 'parent_child') {
      // `member_id` is the parent, `related_member_id` the child — the same
      // direction buildFamilyTreeNodes reads them in.
      ensure(index.parentsOf, rel.related_member_id).set(rel.member_id, rel.parent_child_kind)
      ensure(index.childrenOf, rel.member_id).set(rel.related_member_id, rel.parent_child_kind)
    } else if (rel.relationship_type === 'partner') {
      ensure(index.partnersOf, rel.member_id).set(rel.related_member_id, rel.partner_status)
      ensure(index.partnersOf, rel.related_member_id).set(rel.member_id, rel.partner_status)
    }
    // 'custom' edges (godparent, guardian) carry their own label and are shown
    // verbatim on the profile; they have no place in a computed kinship term.
  }

  return index
}

function lineageParents(index: KinshipIndex, id: string): string[] {
  const parents = index.parentsOf.get(id)
  if (!parents) return []
  return [...parents.entries()]
    .filter(([, kind]) => kind === null || LINEAGE_KINDS.has(kind))
    .map(([parentId]) => parentId)
}

/**
 * Every ancestor reachable through lineage edges, mapped to the fewest
 * generations away it sits. Breadth-first so the first depth recorded is the
 * shortest; `seen` also makes a cycle in bad data terminate instead of hanging.
 */
function ancestorDepths(index: KinshipIndex, id: string): Map<string, number> {
  const depths = new Map<string, number>([[id, 0]])
  let frontier = [id]
  let depth = 0

  while (frontier.length > 0) {
    depth += 1
    const next: string[] = []
    for (const current of frontier) {
      for (const parentId of lineageParents(index, current)) {
        if (depths.has(parentId)) continue
        depths.set(parentId, depth)
        next.push(parentId)
      }
    }
    frontier = next
  }

  return depths
}

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

function timesRemoved(n: number): string {
  if (n === 1) return 'once removed'
  if (n === 2) return 'twice removed'
  return `${n} times removed`
}

/**
 * "Grandparent" + 1 -> "Great-grandparent"; + 2 -> "2nd great-grandparent".
 * The same progression Ancestry uses, and it applies equally to aunts, nieces
 * and grandchildren.
 */
function withGreats(base: string, greats: number): string {
  if (greats <= 0) return base
  const lowered = base.charAt(0).toLowerCase() + base.slice(1)
  if (greats === 1) return `Great-${lowered}`
  return `${ordinal(greats)} great-${lowered}`
}

function byGender(gender: Gender | null, male: string, female: string, neutral: string): string {
  if (gender === 'male') return male
  if (gender === 'female') return female
  return neutral
}

const PARTNER_TERMS: Record<PartnerStatus, (g: Gender | null) => string> = {
  married: (g) => byGender(g, 'Husband', 'Wife', 'Spouse'),
  partnered: () => 'Partner',
  engaged: (g) => byGender(g, 'Fiancé', 'Fiancée', 'Fiancé(e)'),
  separated: () => 'Separated partner',
  divorced: (g) => byGender(g, 'Ex-husband', 'Ex-wife', 'Former spouse'),
  widowed: (g) => byGender(g, 'Late husband', 'Late wife', 'Late spouse'),
}

/**
 * The term for a blood relative sitting `up` generations above the common
 * ancestor on the subject's side and `down` generations below it on the
 * other's. Returns null for the (0,0) self case, which callers handle first.
 */
function bloodTerm(up: number, down: number, gender: Gender | null): string | null {
  if (up === 0 && down === 0) return null

  // Straight down the line: children, grandchildren, and so on.
  if (up === 0) {
    if (down === 1) return byGender(gender, 'Son', 'Daughter', 'Child')
    return withGreats(byGender(gender, 'Grandson', 'Granddaughter', 'Grandchild'), down - 2)
  }

  // Straight up the line: parents, grandparents, and so on.
  if (down === 0) {
    if (up === 1) return byGender(gender, 'Father', 'Mother', 'Parent')
    return withGreats(byGender(gender, 'Grandfather', 'Grandmother', 'Grandparent'), up - 2)
  }

  if (up === 1 && down === 1) return byGender(gender, 'Brother', 'Sister', 'Sibling')

  // A parent's sibling, or further up the same line. The neutral forms are
  // spelled out rather than slashed so that "Great-" reads correctly in front
  // of them.
  if (down === 1) return withGreats(byGender(gender, 'Uncle', 'Aunt', 'Aunt or uncle'), up - 2)

  // A sibling's child, or further down the same line.
  if (up === 1) return withGreats(byGender(gender, 'Nephew', 'Niece', 'Niece or nephew'), down - 2)

  const degree = Math.min(up, down) - 1
  const removed = Math.abs(up - down)
  const cousin = `${ordinal(degree)} cousin`
  return removed === 0 ? cousin : `${cousin} ${timesRemoved(removed)}`
}

/** Full siblings share every parent; anything less is a half-sibling. */
function isHalfSibling(index: KinshipIndex, a: string, b: string): boolean {
  const aParents = new Set(lineageParents(index, a))
  const bParents = new Set(lineageParents(index, b))
  if (aParents.size === 0 || bParents.size === 0) return false
  if (aParents.size !== bParents.size) return true
  for (const parent of aParents) if (!bParents.has(parent)) return true
  return false
}

function stepTerm(index: KinshipIndex, fromId: string, toId: string, gender: Gender | null): string | null {
  const kindAsParent = index.parentsOf.get(fromId)?.get(toId)
  if (kindAsParent && STEP_KINDS.has(kindAsParent)) {
    return kindAsParent === 'foster'
      ? byGender(gender, 'Foster father', 'Foster mother', 'Foster parent')
      : byGender(gender, 'Stepfather', 'Stepmother', 'Step-parent')
  }

  const kindAsChild = index.childrenOf.get(fromId)?.get(toId)
  if (kindAsChild && STEP_KINDS.has(kindAsChild)) {
    return kindAsChild === 'foster'
      ? byGender(gender, 'Foster son', 'Foster daughter', 'Foster child')
      : byGender(gender, 'Stepson', 'Stepdaughter', 'Stepchild')
  }

  // A step-parent's own children are step-siblings.
  for (const [parentId, kind] of index.parentsOf.get(fromId) ?? []) {
    if (!kind || !STEP_KINDS.has(kind)) continue
    const theirChildren = index.childrenOf.get(parentId)
    if (theirChildren?.has(toId)) {
      return byGender(gender, 'Stepbrother', 'Stepsister', 'Step-sibling')
    }
  }

  return null
}

/** The blood term alone, with no partner, step or in-law fallbacks. */
function directBloodTerm(
  index: KinshipIndex,
  fromId: string,
  toId: string,
  gender: Gender | null
): string | null {
  const fromAncestors = ancestorDepths(index, fromId)
  const toAncestors = ancestorDepths(index, toId)

  let best: { up: number; down: number } | null = null
  for (const [ancestorId, up] of fromAncestors) {
    const down = toAncestors.get(ancestorId)
    if (down === undefined) continue
    if (up === 0 && down === 0) continue
    if (!best || up + down < best.up + best.down || (up + down === best.up + best.down && up < best.up)) {
      best = { up, down }
    }
  }

  if (!best) return null

  if (best.up === 1 && best.down === 1 && isHalfSibling(index, fromId, toId)) {
    return byGender(gender, 'Half-brother', 'Half-sister', 'Half-sibling')
  }

  return bloodTerm(best.up, best.down, gender)
}

/**
 * Turns a kinship term into the plural used to caption a row of the tree:
 * "Parent" -> "parents", "Aunt or uncle" -> "aunts and uncles". Lower-cased
 * because it is read as the tail of "Will's ...".
 */
export function pluralizeKinship(term: string): string {
  const lowered = term.charAt(0).toLowerCase() + term.slice(1)
  // "sibling-in-law" pluralizes on the head noun, not the tail.
  if (lowered.endsWith('-in-law')) {
    return `${pluralizeKinship(lowered.slice(0, -'-in-law'.length))}-in-law`
  }
  if (lowered.includes(' or ')) {
    const [first, second] = lowered.split(' or ')
    return `${first}s and ${second}s`
  }
  if (/child$/.test(lowered)) return lowered.replace(/child$/, 'children')
  return `${lowered}s`
}

export type DescribeKinshipOptions = {
  /** Looks up a member's gender so terms can be specific where the data allows. */
  genderOf?: (memberId: string) => Gender | null
}

/**
 * What `toId` is to `fromId` — read it as "<to> is <from>'s <result>".
 * Returns null when the two are not connected by any relationship this
 * understands, which is a normal outcome, not an error.
 */
export function describeKinship(
  fromId: string,
  toId: string,
  index: KinshipIndex,
  options: DescribeKinshipOptions = {}
): string | null {
  if (fromId === toId) return 'You'

  const genderOf = options.genderOf ?? (() => null)
  const toGender = genderOf(toId)

  const partnerStatus = index.partnersOf.get(fromId)?.get(toId)
  if (partnerStatus !== undefined) {
    return partnerStatus ? PARTNER_TERMS[partnerStatus](toGender) : 'Partner'
  }

  const blood = directBloodTerm(index, fromId, toId, toGender)
  if (blood) return blood

  const step = stepTerm(index, fromId, toId, toGender)
  if (step) return step

  // In-laws, one hop only: either they married into our family, or we married
  // into theirs. Anything further out reads as noise rather than information.
  for (const [partnerId] of index.partnersOf.get(toId) ?? []) {
    const term = directBloodTerm(index, fromId, partnerId, null)
    if (term) return `${term}-in-law`
  }

  for (const [partnerId] of index.partnersOf.get(fromId) ?? []) {
    const term = directBloodTerm(index, partnerId, toId, null)
    if (term) return `${term}-in-law`
  }

  return null
}
