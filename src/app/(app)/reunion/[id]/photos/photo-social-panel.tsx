'use client'

import { useState, useTransition } from 'react'
import { Heart, Loader2, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReportButton } from '@/components/report-button'
import { addComment, deleteComment, toggleLike } from '@/lib/actions/photo-social'
import {
  EMPTY_LIKE_SUMMARY,
  makeOptimisticId,
  mergeComments,
  toggleLikeSummary,
  type LikeSummary,
  type PhotoComment,
} from '@/lib/photo-social'

interface PhotoSocialPanelProps {
  photoId: string
  reunionId: string
  currentMemberId: string
  currentMemberName: string
  canModerate: boolean
  likes: LikeSummary
  comments: PhotoComment[]
}

/**
 * The like button and comment thread inside the lightbox.
 *
 * Holds its own copy of the likes and comments it was handed, because the
 * server component only re-renders on a refresh and a like that took a second
 * to appear would feel broken. The server's answer is still authoritative: a
 * failure rolls the optimistic change back rather than leaving a lie on screen.
 */
export function PhotoSocialPanel({
  photoId,
  reunionId,
  currentMemberId,
  currentMemberName,
  canModerate,
  likes: initialLikes,
  comments: initialComments,
}: PhotoSocialPanelProps) {
  const [likes, setLikes] = useState<LikeSummary>(initialLikes ?? EMPTY_LIKE_SUMMARY)
  const [comments, setComments] = useState<PhotoComment[]>(initialComments)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleLike() {
    const before = likes
    setLikes(toggleLikeSummary(likes, currentMemberName))
    setError(null)

    startTransition(async () => {
      try {
        await toggleLike(photoId, reunionId)
      } catch (e) {
        setLikes(before)
        setError(e instanceof Error ? e.message : 'That did not work.')
      }
    })
  }

  function handleComment(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return

    const placeholder: PhotoComment = {
      id: makeOptimisticId(),
      photo_id: photoId,
      body: text,
      created_at: new Date().toISOString(),
      author: { id: currentMemberId, name: currentMemberName, photo_url: null },
    }

    setComments((prev) => [...prev, placeholder])
    setDraft('')
    setError(null)

    startTransition(async () => {
      try {
        const saved = await addComment(photoId, reunionId, text)
        setComments((prev) => mergeComments(prev, [saved]))
      } catch (err) {
        // Put the words back in the box — retyping a lost comment is worse
        // than the failure itself.
        setComments((prev) => prev.filter((c) => c.id !== placeholder.id))
        setDraft(text)
        setError(err instanceof Error ? err.message : 'Comment failed to send.')
      }
    })
  }

  function handleDelete(commentId: string) {
    const before = comments
    setComments((prev) => prev.filter((c) => c.id !== commentId))
    setError(null)

    startTransition(async () => {
      try {
        await deleteComment(commentId, reunionId)
      } catch (e) {
        setComments(before)
        setError(e instanceof Error ? e.message : 'Could not delete that.')
      }
    })
  }

  return (
    <div className="flex w-full flex-col gap-3 text-white sm:w-80">
      {/* Likes */}
      <div className="flex items-start gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleLike}
          className="h-8 gap-1.5 px-2 text-white hover:bg-white/10 hover:text-white"
          aria-pressed={likes.likedByMe}
          aria-label={likes.likedByMe ? 'Unlike this photo' : 'Like this photo'}
        >
          <Heart
            className={`h-4 w-4 ${likes.likedByMe ? 'fill-red-500 text-red-500' : ''}`}
          />
          <span className="text-sm">{likes.count}</span>
        </Button>
        {likes.names.length > 0 && (
          <p className="mt-1.5 text-xs text-white/60">Liked by {likes.names.join(', ')}</p>
        )}
      </div>

      {/* Comments */}
      <div className="max-h-48 space-y-2 overflow-y-auto sm:max-h-[50vh]">
        {comments.length === 0 ? (
          <p className="text-xs text-white/40">No comments yet.</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="group flex items-start justify-between gap-2">
              <p className="text-xs leading-relaxed">
                <span className="font-medium">{comment.author?.name ?? 'Someone'}</span>{' '}
                <span className="text-white/80">{comment.body}</span>
              </p>
              <div className="mt-0.5 flex shrink-0 items-center gap-1">
                {/* Reporting somebody else's comment. Not your own — there is a
                    delete button for that, and a queue full of people
                    reporting themselves helps nobody. */}
                {comment.author?.id !== currentMemberId && (
                  <ReportButton
                    contentType="photo_comment"
                    contentId={comment.id}
                    reunionId={reunionId}
                    subject={comment.author?.name ?? null}
                    className="h-6 w-6 text-white/40 hover:bg-white/10 hover:text-white"
                  />
                )}
                {(canModerate || comment.author?.id === currentMemberId) && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="hidden shrink-0 text-white/40 hover:text-destructive group-hover:block"
                    aria-label="Delete comment"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Composer. Keystrokes are stopped from reaching the lightbox, which
          reads arrow keys as next/previous photo and Escape as close. */}
      <form onSubmit={handleComment} className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Add a comment..."
          maxLength={1000}
          className="h-8 flex-1 rounded-md border border-white/20 bg-white/10 px-2 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
        />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          disabled={isPending || !draft.trim()}
          className="h-8 w-8 shrink-0 text-white hover:bg-white/10 hover:text-white"
          aria-label="Post comment"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </form>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
