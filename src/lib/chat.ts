// Reconciling the optimistic message list with what the server actually has.
//
// The chat shows a message the moment you send it, then polls for everything
// new. Those two paths used to collide: the placeholder carried a client
// timestamp and a made-up id, so when the real row came back from the poll it
// was appended as a second, identical message — every time anyone posted.
//
// Pure, so the merge rules can be tested without a database or a clock.

export type ChatMessage = {
  id: string
  body: string
  created_at: string
  sender: { id: string; name: string; photo_url: string | null } | null
}

/** Placeholder ids are distinguishable so they can be swapped out later. */
export const OPTIMISTIC_PREFIX = 'pending:'

export function isOptimistic(message: ChatMessage): boolean {
  return message.id.startsWith(OPTIMISTIC_PREFIX)
}

export function makeOptimisticId(): string {
  return `${OPTIMISTIC_PREFIX}${Math.random().toString(36).slice(2)}${Date.now()}`
}

/**
 * Adds server messages to the list, replacing any placeholder they confirm and
 * ignoring anything already present.
 *
 * A placeholder is matched by sender and body rather than by id, because the
 * server assigns the real id and the client never knew it. That is only
 * ambiguous if someone sends the same text twice before the first confirms, in
 * which case the oldest matching placeholder is the one resolved — which is
 * also the one that was sent first.
 */
export function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage[]
): ChatMessage[] {
  if (incoming.length === 0) return current

  const next = [...current]

  for (const message of incoming) {
    // Already have it: a poll overlapping a send, or two polls racing.
    if (next.some((m) => m.id === message.id)) continue

    const placeholderIndex = next.findIndex(
      (m) =>
        isOptimistic(m) &&
        m.body === message.body &&
        m.sender?.id === message.sender?.id
    )

    if (placeholderIndex !== -1) next[placeholderIndex] = message
    else next.push(message)
  }

  return next.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

/**
 * The timestamp to ask the server for messages "since".
 *
 * Only ever derived from confirmed messages. Advancing it past a placeholder's
 * client-generated timestamp is what hid the real row from the very poll meant
 * to reconcile it — and because the client clock can run ahead of the server's,
 * it could also skip other people's messages entirely.
 */
export function latestServerTimestamp(
  messages: ChatMessage[],
  fallback: string
): string {
  const confirmed = messages.filter((m) => !isOptimistic(m))
  if (confirmed.length === 0) return fallback

  return confirmed.reduce(
    (latest, m) => (Date.parse(m.created_at) > Date.parse(latest) ? m.created_at : latest),
    confirmed[0].created_at
  )
}
