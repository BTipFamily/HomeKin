'use client'

import { useState, useEffect } from 'react'
import { Trash2, X, ChevronLeft, ChevronRight, Heart, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deletePhoto } from '@/lib/actions/photos'
import { EMPTY_LIKE_SUMMARY, type LikeSummary, type PhotoComment } from '@/lib/photo-social'
import type { Role } from '@/types/database'
import { PhotoSocialPanel } from './photo-social-panel'

interface PhotoWithUrl {
  id: string
  storage_path: string
  public_url: string
  caption: string | null
  uploaded_by: string | null
  created_at: string
  uploader?: { id: string; name: string; photo_url: string | null } | null
}

interface PhotoGridProps {
  photos: PhotoWithUrl[]
  currentMemberId: string
  currentMemberName: string
  currentMemberRole: Role
  reunionId: string
  likesByPhoto: Record<string, LikeSummary>
  commentsByPhoto: Record<string, PhotoComment[]>
}

export function PhotoGrid({
  photos,
  currentMemberId,
  currentMemberName,
  currentMemberRole,
  reunionId,
  likesByPhoto,
  commentsByPhoto,
}: PhotoGridProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  const canDeleteAll = ['committee', 'admin'].includes(currentMemberRole)

  function prev() {
    setLightboxIdx((i) => (i === null || i === 0 ? photos.length - 1 : i - 1))
  }
  function next() {
    setLightboxIdx((i) => (i === null || i === photos.length - 1 ? 0 : i + 1))
  }

  // Keyboard navigation. Added with the comment box, which made the lightbox a
  // place people type: the composer stops its own keystrokes from bubbling, so
  // arrow keys move the caret there and the photo here.
  useEffect(() => {
    if (lightboxIdx === null) return

    // Stepped inline rather than through prev/next: those are rebuilt every
    // render, so depending on them would tear down and re-add the listener on
    // each keystroke.
    const count = photos.length

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIdx(null)
      else if (e.key === 'ArrowLeft') setLightboxIdx((i) => (i === null || i === 0 ? count - 1 : i - 1))
      else if (e.key === 'ArrowRight') setLightboxIdx((i) => (i === null || i === count - 1 ? 0 : i + 1))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxIdx, photos.length])

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((photo, idx) => {
          const canDelete = canDeleteAll || photo.uploaded_by === currentMemberId
          const likes = likesByPhoto[photo.id] ?? EMPTY_LIKE_SUMMARY
          const commentCount = commentsByPhoto[photo.id]?.length ?? 0
          return (
            <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg bg-muted">
              <img
                src={photo.public_url}
                alt={photo.caption ?? 'Reunion photo'}
                className="h-full w-full cursor-pointer object-cover transition-transform group-hover:scale-105"
                onClick={() => setLightboxIdx(idx)}
              />
              {canDelete && (
                <form
                  action={async () => {
                    await deletePhoto(photo.id, reunionId, photo.storage_path)
                  }}
                  className="absolute right-1 top-1 hidden group-hover:block"
                >
                  <Button
                    type="submit"
                    size="icon"
                    variant="destructive"
                    className="h-6 w-6"
                    onClick={(e) => {
                      if (!confirm('Delete this photo?')) e.preventDefault()
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </form>
              )}

              {/* Always visible, unlike the caption: a count nobody can see is
                  the same as no count at all. */}
              {(likes.count > 0 || commentCount > 0) && (
                <div className="pointer-events-none absolute left-1 top-1 flex gap-1.5 rounded-md bg-black/50 px-1.5 py-0.5 text-[11px] text-white">
                  {likes.count > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Heart
                        className={`h-3 w-3 ${likes.likedByMe ? 'fill-red-500 text-red-500' : ''}`}
                      />
                      {likes.count}
                    </span>
                  )}
                  {commentCount > 0 && (
                    <span className="flex items-center gap-0.5">
                      <MessageCircle className="h-3 w-3" />
                      {commentCount}
                    </span>
                  )}
                </div>
              )}

              {photo.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 line-clamp-2">
                  {photo.caption}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/80"
            onClick={(e) => { e.stopPropagation(); prev() }}
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <div
            className="flex max-h-[90vh] w-full max-w-5xl flex-col gap-4 sm:flex-row sm:items-start"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0 flex-1">
              <img
                src={photos[lightboxIdx].public_url}
                alt={photos[lightboxIdx].caption ?? ''}
                className="max-h-[60vh] w-full rounded-lg object-contain sm:max-h-[80vh]"
              />
              {photos[lightboxIdx].caption && (
                <p className="mt-2 text-center text-sm text-white/80">
                  {photos[lightboxIdx].caption}
                </p>
              )}
              <p className="mt-1 text-center text-xs text-white/50">
                {lightboxIdx + 1} / {photos.length}
                {photos[lightboxIdx].uploader && (
                  <> · {photos[lightboxIdx].uploader!.name}</>
                )}
              </p>
            </div>

            {/* Keyed on the photo id so switching photos resets the panel's
                state instead of carrying one photo's comments to the next. */}
            <PhotoSocialPanel
              key={photos[lightboxIdx].id}
              photoId={photos[lightboxIdx].id}
              reunionId={reunionId}
              currentMemberId={currentMemberId}
              currentMemberName={currentMemberName}
              canModerate={canDeleteAll}
              likes={likesByPhoto[photos[lightboxIdx].id] ?? EMPTY_LIKE_SUMMARY}
              comments={commentsByPhoto[photos[lightboxIdx].id] ?? []}
            />
          </div>

          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/80"
            onClick={(e) => { e.stopPropagation(); next() }}
            aria-label="Next photo"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          <button
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/80"
            onClick={() => setLightboxIdx(null)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  )
}
