import { buildKinshipIndex } from '@/lib/kinship'
import {
  DEFAULT_METRICS,
  buildTreeLayout,
  resolveVisibleSet,
  type ExpansionState,
} from '@/lib/tree-layout'
import type { ParentChildKind, PartnerStatus, Relationship } from '@/types/database'

let seq = 0

function parentOf(
  parentId: string,
  childId: string,
  kind: ParentChildKind = 'biological'
): Relationship {
  return {
    id: `rel-${seq++}`,
    member_id: parentId,
    related_member_id: childId,
    relationship_type: 'parent_child',
    parent_child_kind: kind,
    partner_status: null,
    partner_start_date: null,
    partner_end_date: null,
    custom_label: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function partnerOf(a: string, b: string, status: PartnerStatus = 'married'): Relationship {
  return {
    id: `rel-${seq++}`,
    member_id: a,
    related_member_id: b,
    relationship_type: 'partner',
    parent_child_kind: null,
    partner_status: status,
    partner_start_date: null,
    partner_end_date: null,
    custom_label: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

const NO_EXPANSION: ExpansionState = { up: new Set(), down: new Set() }

function layoutOf(
  rels: Relationship[],
  focusId: string,
  ids: string[],
  expansion: ExpansionState = NO_EXPANSION
) {
  return buildTreeLayout({
    focusId,
    index: buildKinshipIndex(rels),
    visibleIds: new Set(ids),
    expansion,
  })
}

/** A three-generation family: grandparents, parents + an aunt, focus + sibling. */
const FAMILY = [
  partnerOf('gran', 'gramps'),
  parentOf('gran', 'dad'),
  parentOf('gramps', 'dad'),
  parentOf('gran', 'aunt'),
  parentOf('gramps', 'aunt'),
  partnerOf('dad', 'mum'),
  parentOf('dad', 'me'),
  parentOf('mum', 'me'),
  parentOf('dad', 'sis'),
  parentOf('mum', 'sis'),
  parentOf('me', 'kid'),
]
const FAMILY_IDS = ['gran', 'gramps', 'dad', 'mum', 'aunt', 'me', 'sis', 'kid']

describe('resolveVisibleSet', () => {
  const index = buildKinshipIndex(FAMILY)

  test('always shows the focus, their parents, siblings and children', () => {
    const shown = resolveVisibleSet('me', index, new Set(FAMILY_IDS), NO_EXPANSION)
    expect(shown).toContain('me')
    expect(shown).toContain('dad')
    expect(shown).toContain('mum')
    expect(shown).toContain('sis')
    expect(shown).toContain('kid')
  })

  test('leaves grandparents collapsed until asked for', () => {
    const collapsed = resolveVisibleSet('me', index, new Set(FAMILY_IDS), NO_EXPANSION)
    expect(collapsed).not.toContain('gran')

    const expanded = resolveVisibleSet('me', index, new Set(FAMILY_IDS), {
      up: new Set(['dad']),
      down: new Set(),
    })
    expect(expanded).toContain('gran')
    expect(expanded).toContain('gramps')
  })

  test('brings in a partner alongside anyone it reveals', () => {
    const shown = resolveVisibleSet('me', index, new Set(FAMILY_IDS), {
      up: new Set(['dad']),
      down: new Set(),
    })
    // gran is dad's parent; gramps is gran's partner and comes along.
    expect(shown).toContain('gramps')
  })

  test('respects the page-level visibility filter', () => {
    const shown = resolveVisibleSet('me', index, new Set(['me', 'dad']), NO_EXPANSION)
    expect(shown).toContain('dad')
    expect(shown).not.toContain('mum')
  })

  test('returns nothing when the focus itself is filtered out', () => {
    expect(resolveVisibleSet('me', index, new Set(['dad']), NO_EXPANSION).size).toBe(0)
  })
})

describe('buildTreeLayout — generations', () => {
  test('places ancestors above and descendants below the focus', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS)
    const gen = new Map(layout.cards.map((c) => [c.id, c.generation]))

    expect(gen.get('me')).toBe(0)
    expect(gen.get('sis')).toBe(0)
    expect(gen.get('dad')).toBe(-1)
    expect(gen.get('mum')).toBe(-1)
    expect(gen.get('kid')).toBe(1)
  })

  test('puts grandparents two rows up once expanded', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS, {
      up: new Set(['dad']),
      down: new Set(),
    })
    const gen = new Map(layout.cards.map((c) => [c.id, c.generation]))
    expect(gen.get('gran')).toBe(-2)
    expect(gen.get('gramps')).toBe(-2)
  })

  test('gives every member of a generation the same y', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS)
    const byId = new Map(layout.cards.map((c) => [c.id, c]))
    expect(byId.get('me')!.y).toBe(byId.get('sis')!.y)
    expect(byId.get('dad')!.y).toBe(byId.get('mum')!.y)
    expect(byId.get('dad')!.y).toBeLessThan(byId.get('me')!.y)
    expect(byId.get('kid')!.y).toBeGreaterThan(byId.get('me')!.y)
  })

  test('spaces generations by the card height plus the gap', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS)
    const byId = new Map(layout.cards.map((c) => [c.id, c]))
    expect(byId.get('me')!.y - byId.get('dad')!.y).toBe(
      DEFAULT_METRICS.cardHeight + DEFAULT_METRICS.generationGap
    )
  })
})

describe('buildTreeLayout — couples', () => {
  test('sits partners side by side with the couple gap between them', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS)
    const byId = new Map(layout.cards.map((c) => [c.id, c]))
    const gap = Math.abs(byId.get('dad')!.x - byId.get('mum')!.x)
    expect(gap).toBe(DEFAULT_METRICS.cardWidth + DEFAULT_METRICS.coupleGap)
  })

  test('draws a bond between them', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS)
    expect(layout.bonds.length).toBeGreaterThan(0)
    expect(layout.bonds.every((b) => b.x2 > b.x1)).toBe(true)
  })

  test('marks an ended partnership so it can be drawn broken', () => {
    const rels = [partnerOf('a', 'b', 'divorced'), parentOf('a', 'c'), parentOf('b', 'c')]
    const layout = layoutOf(rels, 'c', ['a', 'b', 'c'])
    expect(layout.bonds).toHaveLength(1)
    expect(layout.bonds[0]!.ended).toBe(true)
  })

  test('leaves a current partnership solid', () => {
    const rels = [partnerOf('a', 'b', 'married'), parentOf('a', 'c'), parentOf('b', 'c')]
    const layout = layoutOf(rels, 'c', ['a', 'b', 'c'])
    expect(layout.bonds[0]!.ended).toBe(false)
  })
})

describe('buildTreeLayout — no overlaps', () => {
  function overlaps(layout: ReturnType<typeof layoutOf>) {
    const clashes: string[] = []
    for (const a of layout.cards) {
      for (const b of layout.cards) {
        if (a.id >= b.id) continue
        if (a.y !== b.y) continue
        const apart = Math.abs(a.x - b.x) >= DEFAULT_METRICS.cardWidth
        if (!apart) clashes.push(`${a.id}/${b.id}`)
      }
    }
    return clashes
  }

  test('keeps cards in a row clear of each other', () => {
    expect(overlaps(layoutOf(FAMILY, 'me', FAMILY_IDS))).toEqual([])
  })

  test('stays clear with grandparents and an aunt expanded', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS, {
      up: new Set(['dad', 'mum']),
      down: new Set(['aunt', 'gran']),
    })
    expect(overlaps(layout)).toEqual([])
  })

  test('stays clear across a wide sibling group', () => {
    const rels = [
      partnerOf('p1', 'p2'),
      ...['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].flatMap((c) => [
        parentOf('p1', c),
        parentOf('p2', c),
      ]),
    ]
    const ids = ['p1', 'p2', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']
    expect(overlaps(layoutOf(rels, 'c1', ids))).toEqual([])
  })
})

describe('buildTreeLayout — parents over children', () => {
  test('centres a couple over their children', () => {
    const rels = [
      partnerOf('p1', 'p2'),
      parentOf('p1', 'a'),
      parentOf('p2', 'a'),
      parentOf('p1', 'b'),
      parentOf('p2', 'b'),
    ]
    const layout = layoutOf(rels, 'p1', ['p1', 'p2', 'a', 'b'], {
      up: new Set(),
      down: new Set(['p1']),
    })
    const byId = new Map(layout.cards.map((c) => [c.id, c]))

    const coupleCentre =
      (byId.get('p1')!.x + byId.get('p2')!.x + DEFAULT_METRICS.cardWidth) / 2
    const childrenCentre =
      (Math.min(byId.get('a')!.x, byId.get('b')!.x) +
        Math.max(byId.get('a')!.x, byId.get('b')!.x) +
        DEFAULT_METRICS.cardWidth) /
      2

    expect(Math.abs(coupleCentre - childrenCentre)).toBeLessThan(1)
  })

  test('draws an edge from the couple down to each child', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS)
    // dad+mum -> me, and dad+mum -> sis
    expect(layout.edges.length).toBeGreaterThanOrEqual(2)
    expect(layout.edges.every((e) => e.points.length === 4)).toBe(true)
  })

  test('marks a step edge so it can be drawn broken', () => {
    const rels = [parentOf('stepdad', 'kid', 'step')]
    const layout = layoutOf(rels, 'kid', ['stepdad', 'kid'], {
      up: new Set(),
      down: new Set(['stepdad']),
    })
    expect(layout.edges).toHaveLength(1)
    expect(layout.edges[0]!.dashed).toBe(true)
  })

  test('leaves biological and adoptive edges solid', () => {
    const rels = [parentOf('mum', 'kid', 'adoptive')]
    const layout = layoutOf(rels, 'kid', ['mum', 'kid'])
    expect(layout.edges[0]!.dashed).toBe(false)
  })
})

describe('buildTreeLayout — expansion affordances', () => {
  test('flags a member whose parents are hidden', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS)
    const dad = layout.cards.find((c) => c.id === 'dad')!
    expect(dad.canExpandUp).toBe(true)
  })

  test('clears the flag once those parents are drawn', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS, {
      up: new Set(['dad']),
      down: new Set(),
    })
    const dad = layout.cards.find((c) => c.id === 'dad')!
    expect(dad.canExpandUp).toBe(false)
  })

  test('flags a member whose children are hidden', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS)
    const aunt = layout.cards.find((c) => c.id === 'sis')!
    expect(aunt.canExpandDown).toBe(false)

    const withNiece = layoutOf([...FAMILY, parentOf('sis', 'niece')], 'me', [
      ...FAMILY_IDS,
      'niece',
    ])
    expect(withNiece.cards.find((c) => c.id === 'sis')!.canExpandDown).toBe(true)
  })

  test('never flags an expansion the visibility filter would block', () => {
    const layout = layoutOf(FAMILY, 'me', ['me', 'dad', 'mum', 'sis', 'kid'])
    const dad = layout.cards.find((c) => c.id === 'dad')!
    expect(dad.canExpandUp).toBe(false)
  })
})

describe('buildTreeLayout — bands', () => {
  test('reports one band per generation, in order', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS)
    expect(layout.bands.map((b) => b.generation)).toEqual([-1, 0, 1])
  })

  test('lists the members sitting in each band', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS)
    const parents = layout.bands.find((b) => b.generation === -1)!
    expect(parents.memberIds.sort()).toEqual(['dad', 'mum'])
  })
})

describe('buildTreeLayout — resilience', () => {
  test('returns an empty layout for an unknown focus', () => {
    const layout = layoutOf(FAMILY, 'nobody', FAMILY_IDS)
    expect(layout.cards).toEqual([])
    expect(layout.width).toBe(0)
  })

  test('handles a member with three recorded parents without throwing', () => {
    // The exact shape that crashed relatives-tree.
    const rels = [
      parentOf('mum', 'kid'),
      parentOf('dad', 'kid'),
      parentOf('stepdad', 'kid', 'step'),
    ]
    const layout = layoutOf(rels, 'kid', ['mum', 'dad', 'stepdad', 'kid'])
    expect(layout.cards.map((c) => c.id)).toContain('kid')
    expect(layout.cards.length).toBeGreaterThan(1)
  })

  test('terminates on a parent cycle in bad data', () => {
    const rels = [parentOf('a', 'b'), parentOf('b', 'c'), parentOf('c', 'a')]
    expect(() => layoutOf(rels, 'a', ['a', 'b', 'c'])).not.toThrow()
  })

  test('draws a lone member with no relationships at the origin', () => {
    const layout = layoutOf([], 'solo', ['solo'])
    expect(layout.cards).toHaveLength(1)
    expect(layout.cards[0]!.x).toBe(0)
    expect(layout.cards[0]!.y).toBe(0)
  })

  test('starts the drawing at the origin', () => {
    const layout = layoutOf(FAMILY, 'me', FAMILY_IDS, {
      up: new Set(['dad', 'mum']),
      down: new Set(['aunt']),
    })
    expect(Math.min(...layout.cards.map((c) => c.x))).toBe(0)
    expect(Math.min(...layout.cards.map((c) => c.y))).toBe(0)
  })
})
