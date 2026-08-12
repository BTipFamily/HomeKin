import type {
  Member,
  ParentChildKind,
  PartnerStatus,
  Relationship,
} from '@/types/database'

// Matches relatives-tree's `Node` shape (see relatives-tree/lib/types.d.ts).
// Defined locally with plain string unions instead of importing the
// library's types directly: relatives-tree ships only a `const enum` for
// `Gender`/`RelType`, which can't be imported across modules under
// isolatedModules (Next.js's compiler). The values line up exactly with
// what the library expects at runtime; callers cast at the calcTree
// boundary (see family-tree-view.tsx).
export type FamilyTreeNode = {
  id: string
  gender: 'male' | 'female'
  parents: { id: string; type: 'blood' | 'adopted' }[]
  children: { id: string; type: 'blood' | 'adopted' }[]
  siblings: { id: string; type: 'blood' | 'half' }[]
  spouses: { id: string; type: 'married' | 'divorced' }[]
}

// Cosmetic layout fallback only, for members with no `gender` set — affects
// which side of a couple-node someone renders on, never graph correctness.
function deterministicGender(memberId: string): 'male' | 'female' {
  let hash = 0
  for (let i = 0; i < memberId.length; i++) {
    hash = (hash * 31 + memberId.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 2 === 0 ? 'male' : 'female'
}

// relatives-tree's connector styling only distinguishes blood vs. adopted
// parent-child edges. Our richer `parent_child_kind` (biological/step/
// adoptive/foster) is preserved in the database and shown on profiles;
// here it collapses to the closest visual: only 'biological' renders as
// a blood line, everything else (step/adoptive/foster) as non-blood.
function parentChildRelType(kind: ParentChildKind | null): 'blood' | 'adopted' {
  return kind === 'biological' ? 'blood' : 'adopted'
}

// Similarly, relatives-tree only distinguishes married vs. divorced for
// spouse connectors. Our richer `partner_status` collapses to the closest
// visual: only 'divorced' renders as split, everything else as a couple.
function partnerRelType(status: PartnerStatus | null): 'married' | 'divorced' {
  return status === 'divorced' ? 'divorced' : 'married'
}

function ensure<K, V>(map: Map<K, Map<string, V>>, key: K): Map<string, V> {
  let inner = map.get(key)
  if (!inner) {
    inner = new Map()
    map.set(key, inner)
  }
  return inner
}

// relatives-tree models each person as descending from at most one *couple*
// (0-2 parents). HomeKin's parent_child_kind lets a member end up with 3+
// recorded parents (e.g. both biological parents plus a step-parent, all
// kept on purpose) — feeding that into calcTree crashes deep inside its
// layout arithmetic (`nextFamily.children[index].pos` on a lookup that
// can't succeed) rather than failing gracefully. Cap at two for the tree
// layout only, preferring biological edges; every recorded parent still
// shows on the member's profile page.
function capParents<T extends { type: 'blood' | 'adopted' }>(parents: T[]): T[] {
  if (parents.length <= 2) return parents
  const blood = parents.filter((p) => p.type === 'blood')
  const rest = parents.filter((p) => p.type !== 'blood')
  return [...blood, ...rest].slice(0, 2)
}

/**
 * Denormalizes the `relationships` table into relatives-tree's node graph.
 * Sibling edges (including half-sibling detection) are derived here from
 * shared parent-child edges rather than stored in the database.
 */
export function buildFamilyTreeNodes(
  members: Pick<Member, 'id' | 'gender'>[],
  relationships: Relationship[]
): FamilyTreeNode[] {
  const memberIds = new Set(members.map((m) => m.id))
  const genderOf = new Map(
    members.map((m) => [m.id, m.gender ?? deterministicGender(m.id)] as const)
  )

  const parentsOf = new Map<string, Map<string, 'blood' | 'adopted'>>()
  const childrenOf = new Map<string, Map<string, 'blood' | 'adopted'>>()
  const spousesOf = new Map<string, Map<string, 'married' | 'divorced'>>()

  for (const rel of relationships) {
    if (!memberIds.has(rel.member_id) || !memberIds.has(rel.related_member_id)) continue

    if (rel.relationship_type === 'parent_child') {
      const type = parentChildRelType(rel.parent_child_kind)
      ensure(parentsOf, rel.related_member_id).set(rel.member_id, type)
      ensure(childrenOf, rel.member_id).set(rel.related_member_id, type)
    } else if (rel.relationship_type === 'partner') {
      const type = partnerRelType(rel.partner_status)
      ensure(spousesOf, rel.member_id).set(rel.related_member_id, type)
      ensure(spousesOf, rel.related_member_id).set(rel.member_id, type)
    }
    // 'custom' relationships (e.g. godparent, guardian) don't map to a
    // parent/child/spouse edge relatives-tree understands, so they're
    // shown on the profile page but not drawn in the tree graph.
  }

  const siblingsOf = new Map<string, Map<string, 'blood' | 'half'>>()
  for (const [childId, parents] of parentsOf.entries()) {
    const parentIds = new Set(parents.keys())
    if (parentIds.size === 0) continue
    for (const [otherChildId, otherParents] of parentsOf.entries()) {
      if (otherChildId === childId) continue
      const otherParentIds = new Set(otherParents.keys())
      const sharedCount = [...parentIds].filter((p) => otherParentIds.has(p)).length
      if (sharedCount === 0) continue
      const isFullSibling = parentIds.size === otherParentIds.size && sharedCount === parentIds.size
      ensure(siblingsOf, childId).set(otherChildId, isFullSibling ? 'blood' : 'half')
    }
  }

  return members.map((m) => ({
    id: m.id,
    gender: genderOf.get(m.id) ?? 'male',
    parents: capParents(
      [...(parentsOf.get(m.id)?.entries() ?? [])].map(([id, type]) => ({ id, type }))
    ),
    children: [...(childrenOf.get(m.id)?.entries() ?? [])].map(([id, type]) => ({ id, type })),
    siblings: [...(siblingsOf.get(m.id)?.entries() ?? [])].map(([id, type]) => ({ id, type })),
    spouses: [...(spousesOf.get(m.id)?.entries() ?? [])].map(([id, type]) => ({ id, type })),
  }))
}

/** Members with at least one relationship edge — everyone else (friends, guests) is excluded by default. */
export function connectedMemberIds(relationships: Relationship[]): Set<string> {
  const ids = new Set<string>()
  for (const rel of relationships) {
    ids.add(rel.member_id)
    ids.add(rel.related_member_id)
  }
  return ids
}
