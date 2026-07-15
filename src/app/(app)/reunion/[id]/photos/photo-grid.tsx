'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deletePhoto } from '@/lib/actions/photos'
import type { Role } from '@/types/database'

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
  currentMemberRole: Role
  reunionId: string
}

export function PhotoGrid({
  photos,
  currentMemberId,
  currentMemberRole,
  reunionId,
}: PhotoGridProps) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  const canDeleteAll = ['committee', 'admin'].includes(currentMemberRole)

  function prev() {
    setLightboxIdx((i) => (i === null || i === 0 ? photos.length - 1 : i - 1))
  }
  function next() {
    setLightboxIdx((i) => (i === null || i === photos.length - 1 ? 0 : i + 1))
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((photo, idx) => {
          const canDelete = canDeleteAll || photo.uploaded_by === currentMemberId
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/80"
            onClick={(e) => { e.stopPropagation(); prev() }}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <div
            className="relative max-h-[90vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={photos[lightboxIdx].public_url}
              alt={photos[lightboxIdx].caption ?? ''}
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
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

          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/80"
            onClick={(e) => { e.stopPropagation(); next() }}
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          <button
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/80"
            onClick={() => setLightboxIdx(null)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  )
}
