import { findClaimableMember, normalizeEmail, redeemInviteCode } from '@/lib/member-linking'
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = {
  id: string
  email: string
  created_by_proxy: boolean
  auth_user_id: string | null
  created_at: string
}

/**
 * A stand-in for the members/invite_codes tables that records what the query
 * builder was asked for, so the tests assert on behaviour rather than on the
 * shape of the Supabase client.
 */
function fakeClient(rows: Row[]) {
  const updates: Record<string, unknown>[] = []

  const builder = (table: string) => {
    const filters: { col: string; value: unknown }[] = []
    let pendingUpdate: Record<string, unknown> | null = null

    const chain = {
      select() {
        return chain
      },
      update(values: Record<string, unknown>) {
        pendingUpdate = values
        return chain
      },
      eq(col: string, value: unknown) {
        filters.push({ col, value })
        return chain
      },
      is(col: string, value: unknown) {
        filters.push({ col, value })
        return chain
      },
      order() {
        return chain
      },
      limit(n: number) {
        return Promise.resolve({ data: apply().slice(0, n), error: null })
      },
      then(resolve: (r: { data: Row[]; error: null }) => void) {
        if (pendingUpdate) {
          updates.push({ table, values: pendingUpdate, filters: [...filters] })
          return Promise.resolve({ data: [], error: null }).then(resolve)
        }
        return Promise.resolve({ data: apply(), error: null }).then(resolve)
      },
    }

    function apply(): Row[] {
      if (table !== 'members') return []
      return rows.filter((row) =>
        filters.every((f) => (row as unknown as Record<string, unknown>)[f.col] === f.value)
      )
    }

    return chain
  }

  return {
    client: { from: builder } as unknown as SupabaseClient,
    updates,
  }
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'm1',
    email: 'jane@example.com',
    created_by_proxy: true,
    auth_user_id: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('normalizeEmail', () => {
  test('trims and lowercases', () => {
    expect(normalizeEmail('  Joe@Gmail.COM ')).toBe('joe@gmail.com')
  })

  test('handles null and undefined', () => {
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail(undefined)).toBe('')
  })
})

describe('findClaimableMember', () => {
  test('matches an exactly-stored address', async () => {
    const { client } = fakeClient([row({ id: 'm1', email: 'jane@example.com' })])
    expect(await findClaimableMember(client, 'jane@example.com')).toMatchObject({ id: 'm1' })
  })

  test('matches regardless of the case the profile was stored with', async () => {
    // The exact-match query returns nothing, so the fallback scan has to find it.
    const { client } = fakeClient([row({ id: 'm1', email: 'Jane@Example.com' })])
    expect(await findClaimableMember(client, 'jane@example.com')).toMatchObject({ id: 'm1' })
  })

  test('matches when the incoming address has stray case or spacing', async () => {
    const { client } = fakeClient([row({ id: 'm1', email: 'jane@example.com' })])
    expect(await findClaimableMember(client, '  JANE@Example.com ')).toMatchObject({ id: 'm1' })
  })

  test('ignores a profile that has already been claimed', async () => {
    const { client } = fakeClient([
      row({ id: 'm1', email: 'jane@example.com', auth_user_id: 'user-1' }),
    ])
    expect(await findClaimableMember(client, 'jane@example.com')).toBeNull()
  })

  test('ignores a profile that was never a placeholder', async () => {
    const { client } = fakeClient([
      row({ id: 'm1', email: 'jane@example.com', created_by_proxy: false }),
    ])
    expect(await findClaimableMember(client, 'jane@example.com')).toBeNull()
  })

  test('returns null for a blank address rather than matching anything', async () => {
    const { client } = fakeClient([row({ id: 'm1', email: '' })])
    expect(await findClaimableMember(client, '')).toBeNull()
    expect(await findClaimableMember(client, '   ')).toBeNull()
  })

  test('does not match a different address', async () => {
    const { client } = fakeClient([row({ id: 'm1', email: 'bob@example.com' })])
    expect(await findClaimableMember(client, 'jane@example.com')).toBeNull()
  })

  test('an underscore in the local part is not treated as a wildcard', async () => {
    // The reason this uses a JS comparison rather than ilike: under LIKE
    // semantics `joe_smith@x.com` would match `joexsmith@x.com`.
    const { client } = fakeClient([row({ id: 'm1', email: 'joexsmith@x.com' })])
    expect(await findClaimableMember(client, 'joe_smith@x.com')).toBeNull()
  })
})

describe('redeemInviteCode', () => {
  test('marks the code used and records who used it', async () => {
    const { client, updates } = fakeClient([])
    await redeemInviteCode(client, 'abc123', 'member-9')

    expect(updates).toHaveLength(1)
    const update = updates[0] as { table: string; values: Record<string, unknown>; filters: { col: string; value: unknown }[] }
    expect(update.table).toBe('invite_codes')
    expect(update.values.used_by).toBe('member-9')
    expect(update.values.used_at).toBeTruthy()
    // Uppercased to match how codes are stored and shown.
    expect(update.filters).toContainEqual({ col: 'code', value: 'ABC123' })
    // Guard so a second redemption cannot overwrite the first.
    expect(update.filters).toContainEqual({ col: 'used_at', value: null })
  })

  test('does nothing without a code', async () => {
    const { client, updates } = fakeClient([])
    await redeemInviteCode(client, null, 'member-9')
    await redeemInviteCode(client, '', 'member-9')
    await redeemInviteCode(client, '   ', 'member-9')
    expect(updates).toHaveLength(0)
  })
})
