// Turning rows of likes and comments into what a photo tile needs to show.
//
// The album loads every photo in one query and then every like and every
// comment for those photos in one more each, because the alternative — a count
// query per photo — is a round trip per tile and an album is dozens of tiles.
// The grouping therefore happens here, in memory, and being pure means the
// counting rules can be tested without a database.

import { makeOptimisticId, OPTIMISTIC_PREFIX } from '@/lib/chat'

/** Re-exported so callers have one import for the optimistic dance. */
export { makeOptimisticId }

export type LikeRow = {
  photo_id: string
  member: { id: string; name: string } | null
}

export type PhotoComment = {
  id: string
  photo_id: string
  body: string
  created_at: string
  author: { id: string; name: string; photo_url: string | null } | null
}

export type LikeSummary = {
  count: number
  /** Drives the filled/outline heart, and whether a tap likes or unlikes. */
  likedByMe: boolean
  /** Everyone who liked it, in the order the rows arrived. */
  names: string[]
}

export const EMPTY_LIKE_SUMMARY: LikeSummary = {
  count: 0,
  likedByMe: false,
  names: [],
}

export function isOptimisticComment(comment: PhotoComment): boolean {
  return comment.id.startsWith(OPTIMISTIC_PREFIX)
}

/**
 * Groups like rows by photo.
 *
 * `count` is the number of rows rather than the number of names: a member
 * deleted since they liked leaves a row whose join came back null, and
 * dropping it from the count would make the number disagree with the heart
 * the person themselves can still see.
 */
export function summarizeLikes(
  likes: LikeRow[],
  currentMemberId: string
): Record<string, LikeSummary> {
  const byPhoto: Record<string, LikeSummary> = {}

  for (const like of likes) {
    const summary = (byPhoto[like.photo_id] ??= { count: 0, likedByMe: false, names: [] })
    summary.count += 1
    if (like.member?.id === currentMemberId) summary.likedByMe = true
    if (like.member?.name) summary.names.push(like.member.name)
  }

  return byPhoto
}

/** Groups comments by photo, oldest first — the order a conversation reads in. */
export function groupComments(comments: PhotoComment[]): Record<string, PhotoComment[]> {
  const byPhoto: Record<string, PhotoComment[]> = {}

  for (const comment of comments) {
    ;(byPhoto[comment.photo_id] ??= []).push(comment)
  }

  for (const list of Object.values(byPhoto)) {
    list.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  }

  return byPhoto
}

/**
 * Adds a saved comment to a list, replacing the placeholder it confirms.
 *
 * The same problem chat had: the optimistic row carries an invented id, so
 * without this the refreshed page shows the comment twice. Matched on author
 * and body because the client never knew the real id.
 */
export function mergeComments(
  current: PhotoComment[],
  incoming: PhotoComment[]
): PhotoComment[] {
  if (incoming.length === 0) return current

  const next = [...current]

  for (const comment of incoming) {
    if (next.some((c) => c.id === comment.id)) continue

    const placeholderIndex = next.findIndex(
      (c) =>
        isOptimisticComment(c) &&
        c.body === comment.body &&
        c.author?.id === comment.author?.id
    )

    if (placeholderIndex !== -1) next[placeholderIndex] = comment
    else next.push(comment)
  }

  return next.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

/**
 * What the like button reads after a tap, before the server has answered.
 *
 * Kept here rather than inline in the component so the "unliking removes your
 * name, liking appends it" rule is testable.
 */
export function toggleLikeSummary(
  summary: LikeSummary,
  currentMemberName: string
): LikeSummary {
  if (summary.likedByMe) {
    const names = [...summary.names]
    const mine = names.indexOf(currentMemberName)
    if (mine !== -1) names.splice(mine, 1)
    return { count: Math.max(summary.count - 1, 0), likedByMe: false, names }
  }

  return {
    count: summary.count + 1,
    likedByMe: true,
    names: [...summary.names, currentMemberName],
  }
}
