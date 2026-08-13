/**
 * What the family tree page needs from the `relationships` table before the
 * layout engine takes over.
 *
 * This file used to also denormalize the table into relatives-tree's node
 * graph. That library has been replaced by `src/lib/tree-layout.ts`, which
 * works straight off the kinship index — so the node builder, its gender
 * fallback and the two-parent cap that worked around the library's layout
 * crash all went with it.
 */

type RelationshipEdge = {
  member_id: string
  related_member_id: string
}

/** Members with at least one relationship edge — everyone else (friends, guests) is excluded by default. */
export function connectedMemberIds(relationships: RelationshipEdge[]): Set<string> {
  const ids = new Set<string>()
  for (const rel of relationships) {
    ids.add(rel.member_id)
    ids.add(rel.related_member_id)
  }
  return ids
}
