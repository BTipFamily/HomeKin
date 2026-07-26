import {
  isOptimistic,
  latestServerTimestamp,
  makeOptimisticId,
  mergeMessages,
  OPTIMISTIC_PREFIX,
  type ChatMessage,
} from '@/lib/chat'

const me = { id: 'me', name: 'Me', photo_url: null }
const them = { id: 'them', name: 'Them', photo_url: null }

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'srv-1',
    body: 'hello',
    created_at: '2026-01-01T10:00:00.000Z',
    sender: me,
    ...over,
  }
}

function optimistic(body: string, at: string): ChatMessage {
  return { id: makeOptimisticId(), body, created_at: at, sender: me }
}

describe('optimistic ids', () => {
  test('are recognisable and unique', () => {
    const a = makeOptimisticId()
    const b = makeOptimisticId()
    expect(a.startsWith(OPTIMISTIC_PREFIX)).toBe(true)
    expect(a).not.toBe(b)
    expect(isOptimistic(msg({ id: a }))).toBe(true)
    expect(isOptimistic(msg({ id: 'a-real-uuid' }))).toBe(false)
  })
})

describe('mergeMessages', () => {
  test('replaces the placeholder instead of appending a duplicate', () => {
    // The bug: the server row arrives with a different id and a later
    // timestamp, and used to land alongside the placeholder.
    const pending = optimistic('hello', '2026-01-01T10:00:00.000Z')
    const saved = msg({ id: 'srv-1', body: 'hello', created_at: '2026-01-01T10:00:01.000Z' })

    const merged = mergeMessages([pending], [saved])

    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('srv-1')
  })

  test('ignores a message it already has', () => {
    const saved = msg({ id: 'srv-1' })
    expect(mergeMessages([saved], [saved])).toHaveLength(1)
  })

  test('appends messages from other people', () => {
    const mine = msg({ id: 'srv-1', sender: me })
    const theirs = msg({ id: 'srv-2', body: 'hi', sender: them, created_at: '2026-01-01T10:00:05.000Z' })
    expect(mergeMessages([mine], [theirs])).toHaveLength(2)
  })

  test('does not match a placeholder from a different sender', () => {
    // Same words, different person — two real messages.
    const pending = optimistic('hello', '2026-01-01T10:00:00.000Z')
    const theirs = msg({ id: 'srv-9', body: 'hello', sender: them })
    const merged = mergeMessages([pending], [theirs])
    expect(merged).toHaveLength(2)
  })

  test('resolves the oldest placeholder when the same text is sent twice', () => {
    const first = optimistic('ok', '2026-01-01T10:00:00.000Z')
    const second = optimistic('ok', '2026-01-01T10:00:02.000Z')
    const saved = msg({ id: 'srv-1', body: 'ok', created_at: '2026-01-01T10:00:01.000Z' })

    const merged = mergeMessages([first, second], [saved])

    expect(merged).toHaveLength(2)
    expect(merged.some((m) => m.id === 'srv-1')).toBe(true)
    // The second placeholder is still waiting for its own confirmation.
    expect(merged.filter(isOptimistic).map((m) => m.id)).toEqual([second.id])
  })

  test('keeps the list in chronological order', () => {
    const a = msg({ id: 'a', created_at: '2026-01-01T10:00:00.000Z' })
    const c = msg({ id: 'c', created_at: '2026-01-01T10:00:20.000Z' })
    const b = msg({ id: 'b', created_at: '2026-01-01T10:00:10.000Z' })
    expect(mergeMessages([a, c], [b]).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  test('an empty poll leaves the list untouched', () => {
    const list = [msg()]
    expect(mergeMessages(list, [])).toBe(list)
  })

  test('handles several new messages at once', () => {
    const existing = msg({ id: 'a' })
    const incoming = [
      msg({ id: 'b', created_at: '2026-01-01T10:00:10.000Z' }),
      msg({ id: 'c', created_at: '2026-01-01T10:00:20.000Z' }),
    ]
    expect(mergeMessages([existing], incoming).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('latestServerTimestamp', () => {
  test('ignores placeholders, which carry a client clock', () => {
    // The placeholder is "newer" than the confirmed message, but asking the
    // server for anything after it would skip the real row.
    const confirmed = msg({ id: 'srv-1', created_at: '2026-01-01T10:00:00.000Z' })
    const pending = optimistic('later', '2026-01-01T10:05:00.000Z')

    expect(latestServerTimestamp([confirmed, pending], 'fallback')).toBe(
      '2026-01-01T10:00:00.000Z'
    )
  })

  test('returns the newest confirmed timestamp regardless of order', () => {
    const messages = [
      msg({ id: 'a', created_at: '2026-01-01T10:00:00.000Z' }),
      msg({ id: 'c', created_at: '2026-01-01T10:00:30.000Z' }),
      msg({ id: 'b', created_at: '2026-01-01T10:00:10.000Z' }),
    ]
    expect(latestServerTimestamp(messages, 'fallback')).toBe('2026-01-01T10:00:30.000Z')
  })

  test('falls back when nothing is confirmed yet', () => {
    expect(latestServerTimestamp([], 'fallback')).toBe('fallback')
    expect(latestServerTimestamp([optimistic('x', '2026-01-01T10:00:00.000Z')], 'fallback')).toBe(
      'fallback'
    )
  })
})

describe('the reported bug, end to end', () => {
  test('sending a message leaves exactly one entry after the poll', () => {
    let messages: ChatMessage[] = []
    const fallback = '2026-01-01T00:00:00.000Z'

    // 1. Type and send: the placeholder appears immediately.
    const pending = optimistic('Anyone bringing a grill?', '2026-01-01T10:00:00.000Z')
    messages = mergeMessages(messages, [])
    messages = [...messages, pending]
    expect(messages).toHaveLength(1)

    // The cursor must not have moved to the placeholder's client time.
    expect(latestServerTimestamp(messages, fallback)).toBe(fallback)

    // 2. The poll returns the saved row, stamped slightly later by the server.
    const saved = msg({
      id: '8f3c-real-uuid',
      body: 'Anyone bringing a grill?',
      created_at: '2026-01-01T10:00:00.400Z',
    })
    messages = mergeMessages(messages, [saved])

    expect(messages).toHaveLength(1)
    expect(messages[0].id).toBe('8f3c-real-uuid')

    // 3. A later poll returning the same row changes nothing.
    messages = mergeMessages(messages, [saved])
    expect(messages).toHaveLength(1)
  })
})
