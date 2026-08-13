import { buildKinshipIndex, describeKinship, pluralizeKinship } from '@/lib/kinship'
import type {
  Gender,
  ParentChildKind,
  PartnerStatus,
  Relationship,
} from '@/types/database'

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

function partnerOf(
  a: string,
  b: string,
  status: PartnerStatus = 'married'
): Relationship {
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

/** Reads as "<to> is <from>'s ___". */
function term(
  rels: Relationship[],
  from: string,
  to: string,
  genders: Record<string, Gender> = {}
): string | null {
  return describeKinship(from, to, buildKinshipIndex(rels), {
    genderOf: (id) => genders[id] ?? null,
  })
}

describe('describeKinship — the direct line', () => {
  const rels = [
    parentOf('ggp', 'gp'),
    parentOf('gp', 'parent'),
    parentOf('parent', 'me'),
    parentOf('me', 'kid'),
    parentOf('kid', 'grandkid'),
  ]

  test('identifies the subject themselves', () => {
    expect(term(rels, 'me', 'me')).toBe('You')
  })

  test('names parents and children', () => {
    expect(term(rels, 'me', 'parent')).toBe('Parent')
    expect(term(rels, 'me', 'kid')).toBe('Child')
  })

  test('uses gendered terms where gender is recorded', () => {
    expect(term(rels, 'me', 'parent', { parent: 'female' })).toBe('Mother')
    expect(term(rels, 'me', 'kid', { kid: 'male' })).toBe('Son')
    expect(term(rels, 'me', 'gp', { gp: 'male' })).toBe('Grandfather')
  })

  test('climbs to grandparents and great-grandparents', () => {
    expect(term(rels, 'me', 'gp')).toBe('Grandparent')
    expect(term(rels, 'me', 'ggp')).toBe('Great-grandparent')
  })

  test('descends to grandchildren', () => {
    expect(term(rels, 'me', 'grandkid')).toBe('Grandchild')
    expect(term(rels, 'kid', 'ggp')).toBe('2nd great-grandparent')
  })

  test('switches to ordinal greats past the third generation', () => {
    const deep = [
      parentOf('a', 'b'),
      parentOf('b', 'c'),
      parentOf('c', 'd'),
      parentOf('d', 'e'),
      parentOf('e', 'f'),
    ]
    expect(term(deep, 'f', 'c')).toBe('Great-grandparent')
    expect(term(deep, 'f', 'b')).toBe('2nd great-grandparent')
    expect(term(deep, 'f', 'a')).toBe('3rd great-grandparent')
    expect(term(deep, 'a', 'f')).toBe('3rd great-grandchild')
  })
})

describe('describeKinship — siblings', () => {
  test('full siblings share every parent', () => {
    const rels = [
      parentOf('mum', 'a'),
      parentOf('dad', 'a'),
      parentOf('mum', 'b'),
      parentOf('dad', 'b'),
    ]
    expect(term(rels, 'a', 'b')).toBe('Sibling')
    expect(term(rels, 'a', 'b', { b: 'female' })).toBe('Sister')
  })

  test('sharing only one parent is a half-sibling', () => {
    const rels = [
      parentOf('mum', 'a'),
      parentOf('dad', 'a'),
      parentOf('mum', 'b'),
      parentOf('stepdad', 'b'),
    ]
    expect(term(rels, 'a', 'b')).toBe('Half-sibling')
    expect(term(rels, 'a', 'b', { b: 'male' })).toBe('Half-brother')
  })
})

describe('describeKinship — the sideways branches', () => {
  // gp -> parent, auntie; parent -> me; auntie -> cousin; cousin -> cousinKid
  const rels = [
    parentOf('gp', 'parent'),
    parentOf('gp', 'auntie'),
    parentOf('parent', 'me'),
    parentOf('auntie', 'cousin'),
    parentOf('cousin', 'cousinKid'),
    parentOf('me', 'kid'),
  ]

  test("names a parent's sibling", () => {
    expect(term(rels, 'me', 'auntie')).toBe('Aunt or uncle')
    expect(term(rels, 'me', 'auntie', { auntie: 'female' })).toBe('Aunt')
  })

  test("names a sibling's child", () => {
    expect(term(rels, 'auntie', 'me')).toBe('Niece or nephew')
    expect(term(rels, 'auntie', 'me', { me: 'male' })).toBe('Nephew')
  })

  test('counts cousin degrees', () => {
    expect(term(rels, 'me', 'cousin')).toBe('1st cousin')
    expect(term(rels, 'kid', 'cousinKid')).toBe('2nd cousin')
  })

  test('counts generations removed', () => {
    expect(term(rels, 'me', 'cousinKid')).toBe('1st cousin once removed')
    expect(term(rels, 'cousinKid', 'me')).toBe('1st cousin once removed')
  })

  test('reaches great-aunts and great-nieces', () => {
    const wide = [
      parentOf('ggp', 'gp'),
      parentOf('ggp', 'greatAuntie'),
      parentOf('gp', 'parent'),
      parentOf('parent', 'me'),
    ]
    expect(term(wide, 'me', 'greatAuntie')).toBe('Great-aunt or uncle')
    expect(term(wide, 'me', 'greatAuntie', { greatAuntie: 'female' })).toBe('Great-aunt')
    expect(term(wide, 'greatAuntie', 'me')).toBe('Great-niece or nephew')
  })
})

describe('describeKinship — partners', () => {
  test('reads the partner status', () => {
    expect(term([partnerOf('a', 'b', 'married')], 'a', 'b')).toBe('Spouse')
    expect(term([partnerOf('a', 'b', 'married')], 'a', 'b', { b: 'female' })).toBe('Wife')
    expect(term([partnerOf('a', 'b', 'divorced')], 'a', 'b')).toBe('Former spouse')
    expect(term([partnerOf('a', 'b', 'engaged')], 'a', 'b')).toBe('Fiancé(e)')
    expect(term([partnerOf('a', 'b', 'partnered')], 'a', 'b')).toBe('Partner')
  })

  test('is symmetric even though the row is stored one way round', () => {
    expect(term([partnerOf('a', 'b', 'married')], 'b', 'a')).toBe('Spouse')
  })
})

describe('describeKinship — step and foster', () => {
  test('names a step-parent and stepchild', () => {
    const rels = [parentOf('stepdad', 'kid', 'step')]
    expect(term(rels, 'kid', 'stepdad')).toBe('Step-parent')
    expect(term(rels, 'kid', 'stepdad', { stepdad: 'male' })).toBe('Stepfather')
    expect(term(rels, 'stepdad', 'kid')).toBe('Stepchild')
  })

  test('names foster relationships distinctly', () => {
    const rels = [parentOf('carer', 'kid', 'foster')]
    expect(term(rels, 'kid', 'carer')).toBe('Foster parent')
    expect(term(rels, 'carer', 'kid')).toBe('Foster child')
  })

  test("treats a step-parent's own children as step-siblings", () => {
    const rels = [parentOf('stepdad', 'me', 'step'), parentOf('stepdad', 'theirs')]
    expect(term(rels, 'me', 'theirs')).toBe('Step-sibling')
  })

  test('counts adopted children as lineage, not steps', () => {
    const rels = [parentOf('mum', 'a', 'adoptive'), parentOf('mum', 'b')]
    expect(term(rels, 'a', 'mum')).toBe('Parent')
    expect(term(rels, 'a', 'b')).toBe('Sibling')
  })
})

describe('describeKinship — in-laws', () => {
  test("names a sibling's spouse", () => {
    const rels = [
      parentOf('mum', 'me'),
      parentOf('mum', 'sib'),
      partnerOf('sib', 'theirSpouse'),
    ]
    expect(term(rels, 'me', 'theirSpouse')).toBe('Sibling-in-law')
  })

  test("names a spouse's parent", () => {
    const rels = [partnerOf('me', 'spouse'), parentOf('theirMum', 'spouse')]
    expect(term(rels, 'me', 'theirMum')).toBe('Parent-in-law')
  })
})

describe('pluralizeKinship', () => {
  test('lower-cases so it reads as the tail of "Will\'s ..."', () => {
    expect(pluralizeKinship('Parent')).toBe('parents')
    expect(pluralizeKinship('Sibling')).toBe('siblings')
    expect(pluralizeKinship('1st cousin')).toBe('1st cousins')
  })

  test('handles the irregular child plural', () => {
    expect(pluralizeKinship('Child')).toBe('children')
    expect(pluralizeKinship('Grandchild')).toBe('grandchildren')
    expect(pluralizeKinship('Stepchild')).toBe('stepchildren')
    expect(pluralizeKinship('Great-grandchild')).toBe('great-grandchildren')
  })

  test('splits the paired neutral terms', () => {
    expect(pluralizeKinship('Aunt or uncle')).toBe('aunts and uncles')
    expect(pluralizeKinship('Niece or nephew')).toBe('nieces and nephews')
  })

  test('pluralizes in-laws on the head noun', () => {
    expect(pluralizeKinship('Sibling-in-law')).toBe('siblings-in-law')
    expect(pluralizeKinship('Parent-in-law')).toBe('parents-in-law')
    expect(pluralizeKinship('Child-in-law')).toBe('children-in-law')
  })
})

describe('describeKinship — no relationship', () => {
  test('returns null for two unconnected members', () => {
    const rels = [parentOf('a', 'b'), parentOf('c', 'd')]
    expect(term(rels, 'b', 'd')).toBeNull()
  })

  test('ignores custom relationship rows', () => {
    const custom: Relationship = {
      ...parentOf('a', 'b'),
      relationship_type: 'custom',
      parent_child_kind: null,
      custom_label: 'Godparent',
    }
    expect(term([custom], 'b', 'a')).toBeNull()
  })

  test('terminates on a cycle in bad data rather than hanging', () => {
    const rels = [parentOf('a', 'b'), parentOf('b', 'c'), parentOf('c', 'a')]
    expect(() => term(rels, 'a', 'b')).not.toThrow()
  })
})
