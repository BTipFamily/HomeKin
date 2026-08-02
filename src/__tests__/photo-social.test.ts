// Counting likes and reconciling comments.
//
// The invariants worth protecting: a like count must match the heart the
// person themselves sees, and a comment must not appear twice because the
// optimistic copy and the saved row are both in the list.

import {
  EMPTY_LIKE_SUMMARY,
  groupComments,
  isOptimisticComment,
  makeOptimisticId,
  mergeComments,
  summarizeLikes,
  toggleLikeSummary,
  type LikeRow,
  type PhotoComment,
} from '@/lib/photo-social'

const ME = 'member-me'

function like(photoId: string, memberId: string | null, name = 'Someone'): LikeRow {
  return { photo_id: photoId, member: memberId ? { id: memberId, name } : null }
}

function comment(overrides: Partial<PhotoComment> & Pick<PhotoComment, 'id'>): PhotoComment {
  return {
    photo_id: 'p1',
    body: 'Lovely',
    created_at: '2026-07-01T12:00:00Z',
    author: { id: ME, name: 'Me', photo_url: null },
    ...overrides,
  }
}

describe('summarizeLikes', () => {
  it('counts likes per photo and spots my own', () => {
    const summary = summarizeLikes(
      [like('p1', 'other', 'Rose'), like('p1', ME, 'Me'), like('p2', 'other', 'Rose')],
      ME
    )

    expect(summary.p1.count).toBe(2)
    expect(summary.p1.likedByMe).toBe(true)
    expect(summary.p1.names).toEqual(['Rose', 'Me'])

    expect(summary.p2.count).toBe(1)
    expect(summary.p2.likedByMe).toBe(false)
  })

  it('leaves a photo nobody liked out entirely', () => {
    // Callers fall back to EMPTY_LIKE_SUMMARY rather than expecting a zero row.
    expect(summarizeLikes([], ME).p1).toBeUndefined()
    expect(EMPTY_LIKE_SUMMARY.count).toBe(0)
  })

  it('still counts a like whose member has since been deleted', () => {
    // The row survives with a null join. Dropping it would make the number
    // disagree with the count everyone else can see.
    const summary = summarizeLikes([like('p1', null), like('p1', ME, 'Me')], ME)
    expect(summary.p1.count).toBe(2)
    expect(summary.p1.names).toEqual(['Me'])
  })
})

describe('toggleLikeSummary', () => {
  it('adds me and my name when I like', () => {
    const next = toggleLikeSummary({ count: 1, likedByMe: false, names: ['Rose'] }, 'Me')
    expect(next).toEqual({ count: 2, likedByMe: true, names: ['Rose', 'Me'] })
  })

  it('removes me and my name when I unlike', () => {
    const next = toggleLikeSummary({ count: 2, likedByMe: true, names: ['Rose', 'Me'] }, 'Me')
    expect(next).toEqual({ count: 1, likedByMe: false, names: ['Rose'] })
  })

  it('never shows a negative count', () => {
    const next = toggleLikeSummary({ count: 0, likedByMe: true, names: [] }, 'Me')
    expect(next.count).toBe(0)
  })

  it('removes only one name when two people share it', () => {
    const next = toggleLikeSummary({ count: 2, likedByMe: true, names: ['Me', 'Me'] }, 'Me')
    expect(next.names).toEqual(['Me'])
  })
})

describe('groupComments', () => {
  it('groups by photo and orders oldest first', () => {
    const grouped = groupComments([
      comment({ id: 'c2', created_at: '2026-07-02T00:00:00Z' }),
      comment({ id: 'c1', created_at: '2026-07-01T00:00:00Z' }),
      comment({ id: 'c3', photo_id: 'p2' }),
    ])

    expect(grouped.p1.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(grouped.p2.map((c) => c.id)).toEqual(['c3'])
  })
})

describe('mergeComments', () => {
  it('replaces the placeholder with the saved row rather than showing both', () => {
    const placeholder = comment({ id: makeOptimisticId(), body: 'Great shot' })
    const saved = comment({ id: 'c-real', body: 'Great shot' })

    const merged = mergeComments([placeholder], [saved])

    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('c-real')
  })

  it('ignores a row it already has', () => {
    const saved = comment({ id: 'c-real' })
    expect(mergeComments([saved], [saved])).toHaveLength(1)
  })

  it('appends somebody else’s comment', () => {
    const mine = comment({ id: 'c1' })
    const theirs = comment({
      id: 'c2',
      body: 'Great shot',
      author: { id: 'other', name: 'Rose', photo_url: null },
      created_at: '2026-07-02T00:00:00Z',
    })

    expect(mergeComments([mine], [theirs]).map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('does not let one person’s text confirm another’s placeholder', () => {
    // Same words, different author — matching on body alone would swallow one.
    const myPlaceholder = comment({ id: makeOptimisticId(), body: 'Same words' })
    const theirs = comment({
      id: 'c-real',
      body: 'Same words',
      author: { id: 'other', name: 'Rose', photo_url: null },
    })

    const merged = mergeComments([myPlaceholder], [theirs])
    expect(merged).toHaveLength(2)
  })

  it('marks placeholders as optimistic and saved rows as not', () => {
    expect(isOptimisticComment(comment({ id: makeOptimisticId() }))).toBe(true)
    expect(isOptimisticComment(comment({ id: 'c-real' }))).toBe(false)
  })
})
