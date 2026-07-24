import { parseCsv } from '@/lib/csv'
import {
  buildImportPlan,
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  TEMPLATE_CSV,
  type ExistingMember,
} from '@/lib/member-import'

const HEADER = IMPORT_COLUMNS.join(',')

/** Builds a CSV from partial column values keyed by column name. */
function csv(...rows: Record<string, string>[]): string[][] {
  const body = rows.map((row) => IMPORT_COLUMNS.map((c) => row[c] ?? '').join(','))
  return parseCsv([HEADER, ...body].join('\n'))
}

const plan = (
  rows: string[][],
  existing: ExistingMember[] = [],
  importerIsAdmin = true
) => buildImportPlan(rows, existing, { importerIsAdmin })

describe('template', () => {
  test('parses cleanly and every example row is valid', () => {
    const result = plan(parseCsv(TEMPLATE_CSV))
    expect(result.errors).toEqual([])
    expect(result.summary.toCreate).toBe(3)
  })

  test('example rows wire up one couple and two parent edges', () => {
    const result = plan(parseCsv(TEMPLATE_CSV))
    const partners = result.relationships.filter((r) => r.type === 'partner')
    const parents = result.relationships.filter((r) => r.type === 'parent_child')
    // Joe and Rose list each other — that must collapse to a single row.
    expect(partners).toHaveLength(1)
    expect(parents).toHaveLength(2)
  })
})

describe('header handling', () => {
  test('rejects an empty file', () => {
    const result = plan([])
    expect(result.errors[0].message).toMatch(/empty/i)
  })

  test('rejects a file missing the name/email columns', () => {
    const result = plan(parseCsv('foo,bar\n1,2'))
    expect(result.errors[0].message).toMatch(/must include/i)
  })

  test('rejects a header with no data rows', () => {
    const result = plan(parseCsv(HEADER))
    expect(result.errors[0].message).toMatch(/no data rows/i)
  })

  test('warns about unknown columns but still imports', () => {
    const result = plan(parseCsv(`name,email,favorite_color\nJane,jane@x.com,blue`))
    expect(result.errors).toEqual([])
    expect(result.warnings[0].message).toMatch(/favorite_color/)
    expect(result.summary.toCreate).toBe(1)
  })

  test('accepts headers case-insensitively and with spaces', () => {
    const result = plan(parseCsv(`Name,Email,Family Branch\nJane,jane@x.com,Smith`))
    expect(result.errors).toEqual([])
    expect(result.people[0].familyBranch).toBe('Smith')
  })

  test('rejects a file over the row cap', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({
      name: `P${i}`,
      email: `p${i}@x.com`,
    }))
    const result = plan(csv(...rows))
    expect(result.errors[0].message).toMatch(/split it into files/i)
  })
})

describe('person validation', () => {
  test('requires name and email', () => {
    const result = plan(csv({ name: '', email: '' }))
    expect(result.errors.some((e) => e.column === 'name')).toBe(true)
    expect(result.errors.some((e) => e.column === 'email')).toBe(true)
  })

  test('rejects a malformed email', () => {
    const result = plan(csv({ name: 'Jane', email: 'not-an-email' }))
    expect(result.errors[0].message).toMatch(/not a valid email/i)
  })

  test('rejects duplicate emails within the file', () => {
    const result = plan(
      csv({ name: 'Jane', email: 'dupe@x.com' }, { name: 'Janet', email: 'DUPE@x.com' })
    )
    expect(result.errors.some((e) => /Duplicate email/i.test(e.message))).toBe(true)
  })

  test('rejects duplicate external_ids', () => {
    const result = plan(
      csv(
        { external_id: 'a', name: 'Jane', email: 'j@x.com' },
        { external_id: 'A', name: 'John', email: 'jo@x.com' }
      )
    )
    expect(result.errors.some((e) => /Duplicate external_id/i.test(e.message))).toBe(true)
  })

  test('normalizes email to lowercase and trims whitespace', () => {
    const result = plan(csv({ name: '  Jane  ', email: '  JANE@Example.COM  ' }))
    expect(result.people[0].email).toBe('jane@example.com')
    expect(result.people[0].name).toBe('Jane')
  })

  test('rejects an invalid gender', () => {
    const result = plan(csv({ name: 'Jane', email: 'j@x.com', gender: 'unknown' }))
    expect(result.errors[0].column).toBe('gender')
  })

  test('packs social links', () => {
    const result = plan(
      csv({
        name: 'Jane',
        email: 'j@x.com',
        facebook: 'https://fb.com/jane',
        linkedin: 'https://li.com/jane',
      })
    )
    expect(result.people[0].socialLinks).toEqual({
      facebook: 'https://fb.com/jane',
      instagram: null,
      linkedin: 'https://li.com/jane',
    })
  })

  test('empty optional fields become null', () => {
    const result = plan(csv({ name: 'Jane', email: 'j@x.com' }))
    expect(result.people[0].phone).toBeNull()
    expect(result.people[0].address).toBeNull()
    expect(result.people[0].bio).toBeNull()
  })
})

describe('role handling', () => {
  test('defaults to member', () => {
    expect(plan(csv({ name: 'Jane', email: 'j@x.com' })).people[0].role).toBe('member')
  })

  test('an admin importer may assign elevated roles', () => {
    const result = plan(csv({ name: 'Jane', email: 'j@x.com', role: 'committee' }), [], true)
    expect(result.people[0].role).toBe('committee')
    expect(result.warnings).toEqual([])
  })

  test('a committee importer has elevated roles downgraded with a warning', () => {
    const result = plan(csv({ name: 'Jane', email: 'j@x.com', role: 'admin' }), [], false)
    expect(result.people[0].role).toBe('member')
    expect(result.warnings[0].message).toMatch(/Only an admin/i)
    expect(result.errors).toEqual([])
  })

  test('rejects an unknown role', () => {
    const result = plan(csv({ name: 'Jane', email: 'j@x.com', role: 'wizard' }))
    expect(result.errors[0].column).toBe('role')
  })
})

describe('existing members', () => {
  const existing: ExistingMember[] = [{ id: 'm1', email: 'Existing@Example.com' }]

  test('marks matching rows as skipped regardless of case', () => {
    const result = plan(csv({ name: 'Existing', email: 'existing@example.com' }), existing)
    expect(result.people[0].alreadyExists).toBe(true)
    expect(result.summary).toMatchObject({ toCreate: 0, toSkip: 1 })
    expect(result.errors).toEqual([])
  })

  test('an existing member can be referenced as a parent', () => {
    const result = plan(
      csv({ name: 'Kid', email: 'kid@x.com', parent_1: 'existing@example.com' }),
      existing
    )
    expect(result.errors).toEqual([])
    expect(result.relationships).toEqual([
      {
        type: 'parent_child',
        parentEmail: 'existing@example.com',
        childEmail: 'kid@x.com',
        kind: 'biological',
      },
    ])
  })
})

describe('parent relationships', () => {
  test('resolves parents by external_id and defaults kind to biological', () => {
    const result = plan(
      csv(
        { external_id: 'dad', name: 'Dad', email: 'dad@x.com' },
        { external_id: 'mom', name: 'Mom', email: 'mom@x.com' },
        { name: 'Kid', email: 'kid@x.com', parent_1: 'dad', parent_2: 'mom' }
      )
    )
    expect(result.errors).toEqual([])
    expect(result.relationships).toEqual([
      { type: 'parent_child', parentEmail: 'dad@x.com', childEmail: 'kid@x.com', kind: 'biological' },
      { type: 'parent_child', parentEmail: 'mom@x.com', childEmail: 'kid@x.com', kind: 'biological' },
    ])
  })

  test('resolves parents by email', () => {
    const result = plan(
      csv(
        { name: 'Dad', email: 'dad@x.com' },
        { name: 'Kid', email: 'kid@x.com', parent_1: 'DAD@x.com' }
      )
    )
    expect(result.relationships[0]).toMatchObject({ parentEmail: 'dad@x.com' })
  })

  test('honors an explicit parent_kind', () => {
    const result = plan(
      csv(
        { external_id: 'd', name: 'Dad', email: 'dad@x.com' },
        { name: 'Kid', email: 'kid@x.com', parent_1: 'd', parent_kind: 'adoptive' }
      )
    )
    expect(result.relationships[0]).toMatchObject({ kind: 'adoptive' })
  })

  test('rejects an unresolvable parent reference', () => {
    const result = plan(csv({ name: 'Kid', email: 'kid@x.com', parent_1: 'ghost' }))
    expect(result.errors[0].message).toMatch(/Could not find "ghost"/)
  })

  test('rejects a self-referencing parent', () => {
    const result = plan(
      csv({ external_id: 'me', name: 'Kid', email: 'kid@x.com', parent_1: 'me' })
    )
    expect(result.errors[0].message).toMatch(/same person/i)
  })

  test('rejects the same parent listed twice', () => {
    const result = plan(
      csv(
        { external_id: 'd', name: 'Dad', email: 'dad@x.com' },
        { name: 'Kid', email: 'kid@x.com', parent_1: 'd', parent_2: 'dad@x.com' }
      )
    )
    expect(result.errors.some((e) => /parent twice/i.test(e.message))).toBe(true)
    expect(result.relationships).toHaveLength(1)
  })

  test('rejects an invalid parent_kind', () => {
    const result = plan(
      csv(
        { external_id: 'd', name: 'Dad', email: 'dad@x.com' },
        { name: 'Kid', email: 'kid@x.com', parent_1: 'd', parent_kind: 'cousin' }
      )
    )
    expect(result.errors.some((e) => e.column === 'parent_kind')).toBe(true)
  })

  test('skips relationship wiring for rows that already failed validation', () => {
    const result = plan(csv({ name: 'Kid', email: 'bad-email', parent_1: 'ghost' }))
    // Only the email error — no cascading "could not find" noise.
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].column).toBe('email')
  })
})

describe('partner relationships', () => {
  test('collapses a mutually-referencing couple into one row', () => {
    const result = plan(
      csv(
        { external_id: '1', name: 'A', email: 'a@x.com', spouse: '2' },
        { external_id: '2', name: 'B', email: 'b@x.com', spouse: '1' }
      )
    )
    expect(result.relationships).toHaveLength(1)
    expect(result.relationships[0]).toMatchObject({ type: 'partner', status: 'married' })
  })

  test('defaults status to married and carries dates through', () => {
    const result = plan(
      csv(
        { external_id: '1', name: 'A', email: 'a@x.com' },
        {
          name: 'B',
          email: 'b@x.com',
          spouse: '1',
          spouse_status: 'divorced',
          spouse_start_date: '1990-01-02',
          spouse_end_date: '2001-03-04',
        }
      )
    )
    expect(result.relationships[0]).toMatchObject({
      type: 'partner',
      status: 'divorced',
      startDate: '1990-01-02',
      endDate: '2001-03-04',
    })
  })

  test('rejects an invalid spouse_status', () => {
    const result = plan(
      csv(
        { external_id: '1', name: 'A', email: 'a@x.com' },
        { name: 'B', email: 'b@x.com', spouse: '1', spouse_status: 'complicated' }
      )
    )
    expect(result.errors.some((e) => e.column === 'spouse_status')).toBe(true)
    expect(result.relationships).toEqual([])
  })

  test('rejects a badly formatted date', () => {
    const result = plan(
      csv(
        { external_id: '1', name: 'A', email: 'a@x.com' },
        { name: 'B', email: 'b@x.com', spouse: '1', spouse_start_date: '06/14/1975' }
      )
    )
    expect(result.errors.some((e) => e.column === 'spouse_start_date')).toBe(true)
  })

  test('rejects marrying yourself', () => {
    const result = plan(
      csv({ external_id: 'me', name: 'A', email: 'a@x.com', spouse: 'me' })
    )
    expect(result.errors[0].message).toMatch(/same person/i)
  })
})
