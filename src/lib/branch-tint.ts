/**
 * Assigns a colour to each family branch for the tree view.
 *
 * Ancestry tints its cards by gender. That is the wrong axis here: `gender` is
 * nullable on `members` and often unset — `family-tree.ts` carries a
 * `deterministicGender()` hash purely so unset members land somewhere stable —
 * so tinting by it would encode a coin flip. `family_branch` is what the
 * directory already filters on, and colouring by it makes the thing people
 * actually come to a family tree to see (where the branches meet) legible at a
 * glance.
 */

/** Tint keys; each has a matching `--tree-tint-*` pair in globals.css. */
export const BRANCH_TINTS = ['clay', 'wheat', 'sage', 'teal', 'plum', 'lilac'] as const

export type BranchTint = (typeof BRANCH_TINTS)[number] | 'none'

/**
 * Branch name -> tint, assigned by position in the sorted branch list so that
 * a given branch keeps its colour as long as the set of branches is unchanged.
 * Adding a branch can reshuffle the rest; that is the deliberate trade for not
 * storing a colour per branch in the database.
 */
export function buildBranchTintMap(branches: (string | null)[]): Map<string, BranchTint> {
  const named = [...new Set(branches.filter((b): b is string => !!b && b.trim() !== ''))].sort(
    (a, b) => a.localeCompare(b)
  )

  return new Map(named.map((branch, i) => [branch, BRANCH_TINTS[i % BRANCH_TINTS.length]!]))
}

/** Members with no branch recorded get the neutral tint rather than a colour. */
export function tintFor(
  branch: string | null | undefined,
  tints: Map<string, BranchTint>
): BranchTint {
  if (!branch) return 'none'
  return tints.get(branch) ?? 'none'
}
