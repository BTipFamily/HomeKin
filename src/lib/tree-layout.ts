import type { KinshipIndex } from '@/lib/kinship'

/**
 * Lays out a family tree the way a pedigree chart reads: one row per
 * generation, ancestors above the focus person and descendants below, couples
 * side by side, and children centred under their parents.
 *
 * This replaces relatives-tree's whole-graph layout. That library computes
 * every connected member in a single pass, which gives no way to collapse a
 * branch, no generation metadata to caption a row with, and no room to treat
 * ancestors and descendants differently. It was also the source of the
 * `t.children[i].pos` crash: its internal arithmetic assumes shapes our
 * relationship model does not guarantee. Owning the layout removes that whole
 * class of failure, because nothing here can throw on unusual data — a
 * relationship it cannot place is simply not drawn.
 */

export type ExpansionState = {
  /** Members whose parents should be shown. */
  up: ReadonlySet<string>
  /** Members whose children should be shown. */
  down: ReadonlySet<string>
}

export type LayoutMetrics = {
  cardWidth: number
  cardHeight: number
  /** Between two people in a couple. */
  coupleGap: number
  /** Between neighbouring sibling groups. */
  siblingGap: number
  /** Between one generation row and the next. */
  generationGap: number
}

export const DEFAULT_METRICS: LayoutMetrics = {
  cardWidth: 112,
  cardHeight: 152,
  coupleGap: 16,
  siblingGap: 28,
  generationGap: 76,
}

export type PlacedCard = {
  id: string
  x: number
  y: number
  generation: number
  /** True when this member has parents that are not currently drawn. */
  canExpandUp: boolean
  /** True when this member has children that are not currently drawn. */
  canExpandDown: boolean
}

export type PlacedBond = {
  key: string
  x1: number
  y: number
  x2: number
  /** A partnership that has ended is drawn broken. */
  ended: boolean
}

/** An orthogonal drop from a couple to their children, as a polyline. */
export type PlacedEdge = {
  key: string
  points: readonly (readonly [number, number])[]
  /** Step, adoptive and foster edges are drawn broken. */
  dashed: boolean
}

export type PlacedBand = {
  generation: number
  y: number
  /** Horizontal extent of the row, so a caption can be centred under it. */
  centerX: number
  memberIds: string[]
}

export type TreeLayout = {
  cards: PlacedCard[]
  bonds: PlacedBond[]
  edges: PlacedEdge[]
  bands: PlacedBand[]
  width: number
  height: number
}

type Unit = {
  key: string
  /** One or two members: a person, or a couple. */
  members: string[]
  generation: number
  /** The unit this one hangs under for positioning. */
  parentKey: string | null
  /** Children used for positioning — those whose primary parent is this unit. */
  childKeys: string[]
  /**
   * Every child unit this one parents, primary or not. A couple has his
   * parents and her parents; only one of those can own the layout, but both
   * must be drawn, or a whole set of grandparents floats unconnected.
   */
  edgeChildKeys: string[]
  /** Relative to the parent unit's subtree during layout, absolute afterwards. */
  x: number
  subtreeWidth: number
  ownWidth: number
}

export type BuildLayoutOptions = {
  focusId: string
  index: KinshipIndex
  /** Only these members may be drawn — the page's visibility filter. */
  visibleIds: ReadonlySet<string>
  expansion: ExpansionState
  metrics?: LayoutMetrics
  /** Orders siblings within a row. Defaults to member id for determinism. */
  compare?: (a: string, b: string) => number
}

function lineageParents(index: KinshipIndex, id: string): string[] {
  const parents = index.parentsOf.get(id)
  return parents ? [...parents.keys()] : []
}

function childrenOf(index: KinshipIndex, id: string): string[] {
  const children = index.childrenOf.get(id)
  return children ? [...children.keys()] : []
}

function partnersOf(index: KinshipIndex, id: string): string[] {
  const partners = index.partnersOf.get(id)
  return partners ? [...partners.keys()] : []
}

const ENDED_PARTNER_STATUSES = new Set(['divorced', 'separated'])
const SOLID_PARENT_KINDS = new Set(['biological', 'adoptive'])

/**
 * Which members to draw, grown outward from the focus person.
 *
 * The focus's immediate family is always shown. Everything beyond that appears
 * only where the reader has expanded it, which is what keeps a large family
 * from rendering as a wall of cards.
 */
export function resolveVisibleSet(
  focusId: string,
  index: KinshipIndex,
  visibleIds: ReadonlySet<string>,
  expansion: ExpansionState
): Set<string> {
  const allowed = (id: string) => visibleIds.has(id)
  if (!allowed(focusId)) return new Set()

  const shown = new Set<string>([focusId])

  const addWithPartners = (id: string) => {
    if (!allowed(id) || shown.has(id)) return
    shown.add(id)
    for (const partnerId of partnersOf(index, id)) {
      if (allowed(partnerId)) shown.add(partnerId)
    }
  }

  // The focus person's own row and the rows either side of it, always.
  for (const partnerId of partnersOf(index, focusId)) addWithPartners(partnerId)
  for (const parentId of lineageParents(index, focusId)) addWithPartners(parentId)
  for (const childId of childrenOf(index, focusId)) addWithPartners(childId)
  for (const parentId of lineageParents(index, focusId)) {
    for (const siblingId of childrenOf(index, parentId)) addWithPartners(siblingId)
  }

  // Then grow to a fixpoint, so expanding a grandparent can reveal a
  // great-grandparent in the same pass.
  let changed = true
  let guard = 0
  while (changed && guard < 64) {
    changed = false
    guard += 1
    for (const id of [...shown]) {
      if (expansion.up.has(id)) {
        for (const parentId of lineageParents(index, id)) {
          if (allowed(parentId) && !shown.has(parentId)) {
            addWithPartners(parentId)
            changed = true
          }
        }
      }
      if (expansion.down.has(id)) {
        for (const childId of childrenOf(index, id)) {
          if (allowed(childId) && !shown.has(childId)) {
            addWithPartners(childId)
            changed = true
          }
        }
      }
    }
  }

  return shown
}

/**
 * Generation relative to the focus person, derived the same way kinship terms
 * are: `down - up` from the nearest common ancestor. A parent is -1, a
 * grandchild +2, and a cousin 0.
 */
function generationsFrom(
  focusId: string,
  index: KinshipIndex,
  shown: ReadonlySet<string>
): Map<string, number> {
  const generation = new Map<string, number>([[focusId, 0]])

  // Breadth-first over parent, child and partner edges, carrying the
  // generation delta on each step. Partners share a generation.
  const queue: string[] = [focusId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const currentGen = generation.get(current)!

    const step = (id: string, gen: number) => {
      if (!shown.has(id) || generation.has(id)) return
      generation.set(id, gen)
      queue.push(id)
    }

    for (const parentId of lineageParents(index, current)) step(parentId, currentGen - 1)
    for (const childId of childrenOf(index, current)) step(childId, currentGen + 1)
    for (const partnerId of partnersOf(index, current)) step(partnerId, currentGen)
  }

  return generation
}

/** Groups members into couples, leaving anyone unpartnered as a unit of one. */
function buildUnits(
  index: KinshipIndex,
  shown: ReadonlySet<string>,
  generation: Map<string, number>,
  compare: (a: string, b: string) => number
): Map<string, Unit> {
  const units = new Map<string, Unit>()
  const unitOf = new Map<string, string>()
  const ordered = [...shown].sort(compare)

  for (const id of ordered) {
    if (unitOf.has(id)) continue
    const gen = generation.get(id)
    if (gen === undefined) continue

    // At most one partner per unit. A second marriage gets its own unit next
    // door rather than a three-card row, which keeps the couple bond honest.
    const partner = partnersOf(index, id)
      .filter((p) => shown.has(p) && !unitOf.has(p) && generation.get(p) === gen)
      .sort(compare)[0]

    const members = partner ? [id, partner] : [id]
    const key = members.join('+')
    units.set(key, {
      key,
      members,
      generation: gen,
      parentKey: null,
      childKeys: [],
      edgeChildKeys: [],
      x: 0,
      subtreeWidth: 0,
      ownWidth: 0,
    })
    for (const m of members) unitOf.set(m, key)
  }

  // A unit's parent is the unit holding the most of its members' parents, so a
  // child of a drawn couple hangs under that couple rather than one of them.
  for (const unit of units.values()) {
    const tally = new Map<string, number>()
    for (const memberId of unit.members) {
      for (const parentId of lineageParents(index, memberId)) {
        const parentUnitKey = unitOf.get(parentId)
        if (!parentUnitKey || parentUnitKey === unit.key) continue
        const parentUnit = units.get(parentUnitKey)
        if (!parentUnit || parentUnit.generation !== unit.generation - 1) continue
        tally.set(parentUnitKey, (tally.get(parentUnitKey) ?? 0) + 1)
      }
    }
    let best: string | null = null
    let bestCount = 0
    for (const [candidate, count] of [...tally.entries()].sort((a, b) => compare(a[0], b[0]))) {
      if (count > bestCount) {
        best = candidate
        bestCount = count
      }
    }
    unit.parentKey = best
    for (const candidate of tally.keys()) units.get(candidate)!.edgeChildKeys.push(unit.key)
  }

  for (const unit of units.values()) {
    if (unit.parentKey) units.get(unit.parentKey)!.childKeys.push(unit.key)
  }
  const byFirstMember = (a: string, b: string) =>
    compare(units.get(a)!.members[0]!, units.get(b)!.members[0]!)
  for (const unit of units.values()) {
    unit.childKeys.sort(byFirstMember)
    unit.edgeChildKeys.sort(byFirstMember)
  }

  return units
}

export function buildTreeLayout({
  focusId,
  index,
  visibleIds,
  expansion,
  metrics = DEFAULT_METRICS,
  compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0),
}: BuildLayoutOptions): TreeLayout {
  const empty: TreeLayout = { cards: [], bonds: [], edges: [], bands: [], width: 0, height: 0 }

  const shown = resolveVisibleSet(focusId, index, visibleIds, expansion)
  if (shown.size === 0) return empty

  const generation = generationsFrom(focusId, index, shown)
  // Anyone the walk could not reach (a partner-only link into a detached
  // fragment) is dropped rather than guessed at.
  for (const id of [...shown]) if (!generation.has(id)) shown.delete(id)
  if (shown.size === 0) return empty

  const units = buildUnits(index, shown, generation, compare)

  const unitWidth = (unit: Unit) =>
    unit.members.length * metrics.cardWidth + (unit.members.length - 1) * metrics.coupleGap

  // Pass A — subtree widths, and each unit's offset within its own subtree.
  const settled = new Set<string>()
  const measure = (key: string): number => {
    const unit = units.get(key)!
    if (settled.has(key)) return unit.subtreeWidth
    settled.add(key)

    unit.ownWidth = unitWidth(unit)
    const children = unit.childKeys.filter((k) => !settled.has(k))

    if (children.length === 0) {
      unit.subtreeWidth = unit.ownWidth
      return unit.subtreeWidth
    }

    let cursor = 0
    for (const childKey of children) {
      const childWidth = measure(childKey)
      units.get(childKey)!.x = cursor
      cursor += childWidth + metrics.siblingGap
    }
    const childrenWidth = cursor - metrics.siblingGap

    unit.subtreeWidth = Math.max(unit.ownWidth, childrenWidth)
    if (unit.ownWidth > childrenWidth) {
      const shift = (unit.ownWidth - childrenWidth) / 2
      for (const childKey of children) units.get(childKey)!.x += shift
    }
    return unit.subtreeWidth
  }

  const allRoots = [...units.values()]
    .filter((u) => u.parentKey === null)
    .sort((a, b) => a.generation - b.generation || compare(a.members[0]!, b.members[0]!))

  // A unit that parents someone but owns no one's layout — the second set of
  // grandparents. Laying it out in the root sequence would push it past the
  // whole first subtree; it belongs directly above the child it parents.
  const isFloating = (u: Unit) => u.childKeys.length === 0 && u.edgeChildKeys.length > 0
  const roots = allRoots.filter((u) => !isFloating(u))
  const floating = allRoots.filter(isFloating)

  let rootCursor = 0
  for (const root of roots) {
    const width = measure(root.key)
    root.x = rootCursor
    rootCursor += width + metrics.siblingGap
  }
  for (const unit of floating) measure(unit.key)

  // Pass B — relative offsets become absolute.
  const absolute = new Set<string>()
  const resolve = (key: string, parentX: number) => {
    if (absolute.has(key)) return
    absolute.add(key)
    const unit = units.get(key)!
    unit.x += parentX
    for (const childKey of unit.childKeys) resolve(childKey, unit.x)
  }
  for (const root of roots) resolve(root.key, 0)

  // Place each floating unit centred over the child it parents, then slide it
  // clear of anything already occupying that row.
  const rawSpan = (u: Unit) => {
    const own = u.x + (u.subtreeWidth - u.ownWidth) / 2
    return [own, own + u.ownWidth] as const
  }
  for (const unit of floating) {
    const child = units.get(unit.edgeChildKeys[0]!)
    if (!child) continue
    const [childLeft] = rawSpan(child)
    const centred = childLeft + child.ownWidth / 2 - unit.ownWidth / 2
    unit.x = centred - (unit.subtreeWidth - unit.ownWidth) / 2

    const occupied = [...units.values()]
      .filter((o) => o !== unit && o.generation === unit.generation && absolute.has(o.key))
      .map(rawSpan)
      .sort((a, b) => a[0] - b[0])

    for (const [left, right] of occupied) {
      const [myLeft, myRight] = rawSpan(unit)
      if (myRight + metrics.siblingGap > left && myLeft < right + metrics.siblingGap) {
        unit.x += right + metrics.siblingGap - myLeft
      }
    }
    absolute.add(unit.key)
    for (const childKey of unit.childKeys) resolve(childKey, unit.x)
  }

  const generations = [...units.values()].map((u) => u.generation)
  const minGeneration = Math.min(...generations)
  const rowHeight = metrics.cardHeight + metrics.generationGap
  const yFor = (gen: number) => (gen - minGeneration) * rowHeight

  // A unit sits centred within its own subtree. The whole drawing is then
  // shifted so it starts at the origin, which is folded in here rather than
  // applied as a second pass over the finished geometry.
  const rawOwnX = (unit: Unit) => unit.x + (unit.subtreeWidth - unit.ownWidth) / 2
  const minX = Math.min(...[...units.values()].map(rawOwnX))
  const ownXOf = (unit: Unit) => rawOwnX(unit) - minX

  const cards: PlacedCard[] = []
  const bonds: PlacedBond[] = []
  const edges: PlacedEdge[] = []

  for (const unit of units.values()) {
    const ownX = ownXOf(unit)
    const y = yFor(unit.generation)

    unit.members.forEach((memberId, i) => {
      const x = ownX + i * (metrics.cardWidth + metrics.coupleGap)
      const parentIds = lineageParents(index, memberId)
      const childIds = childrenOf(index, memberId)
      cards.push({
        id: memberId,
        x,
        y,
        generation: unit.generation,
        canExpandUp: parentIds.some((p) => visibleIds.has(p) && !shown.has(p)),
        canExpandDown: childIds.some((c) => visibleIds.has(c) && !shown.has(c)),
      })
    })

    if (unit.members.length === 2) {
      const [a, b] = unit.members as [string, string]
      const status = index.partnersOf.get(a)?.get(b) ?? null
      bonds.push({
        key: unit.key,
        x1: ownX + metrics.cardWidth,
        x2: ownX + metrics.cardWidth + metrics.coupleGap,
        y: y + metrics.cardHeight / 2,
        ended: status !== null && ENDED_PARTNER_STATUSES.has(status),
      })
    }

    if (unit.edgeChildKeys.length > 0) {
      const fromX = ownX + unit.ownWidth / 2
      const fromY = y + metrics.cardHeight
      const busY = fromY + metrics.generationGap / 2

      for (const childKey of unit.edgeChildKeys) {
        const child = units.get(childKey)!
        const toX = ownXOf(child) + metrics.cardWidth / 2
        const toY = yFor(child.generation)

        // Every parent edge into this child unit shares the drop, so the
        // dashed treatment follows the first non-lineage edge we find.
        const dashed = child.members.some((childId) =>
          unit.members.some((parentId) => {
            const kind = index.parentsOf.get(childId)?.get(parentId)
            return kind !== undefined && kind !== null && !SOLID_PARENT_KINDS.has(kind)
          })
        )

        edges.push({
          key: `${unit.key}->${childKey}`,
          points: [
            [fromX, fromY],
            [fromX, busY],
            [toX, busY],
            [toX, toY],
          ],
          dashed,
        })
      }
    }
  }

  const byGeneration = new Map<number, PlacedCard[]>()
  for (const card of cards) {
    const list = byGeneration.get(card.generation) ?? []
    list.push(card)
    byGeneration.set(card.generation, list)
  }

  const bands: PlacedBand[] = [...byGeneration.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gen, rowCards]) => {
      const left = Math.min(...rowCards.map((c) => c.x))
      const right = Math.max(...rowCards.map((c) => c.x + metrics.cardWidth))
      return {
        generation: gen,
        y: yFor(gen),
        centerX: (left + right) / 2,
        memberIds: rowCards.map((c) => c.id),
      }
    })

  const width = Math.max(...cards.map((c) => c.x + metrics.cardWidth))
  const height = Math.max(...cards.map((c) => c.y + metrics.cardHeight))

  return { cards, bonds, edges, bands, width, height }
}
