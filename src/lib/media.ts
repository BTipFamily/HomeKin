// What the album accepts, and how a video gets a poster frame.
//
// Limits live here rather than inline in the uploader so the number the UI
// promises and the number the check enforces cannot drift apart — and so the
// one place to change when the Supabase plan changes is obvious.

export type MediaType = 'image' | 'video'

/** Mirrored by the bucket's file_size_limit in migration 020. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** Matches the bucket's allowed_mime_types. Anything else is rejected upstream. */
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

/** How many files can be queued at once, images and videos together. */
export const MAX_BATCH_FILES = 10

export function mediaTypeOf(file: { type: string }): MediaType | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return null
}

export function maxBytesFor(mediaType: MediaType): number {
  return mediaType === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024 * 1024))}GB`
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`
  return `${Math.round(bytes / 1024)}KB`
}

/**
 * Why a file cannot be uploaded, or null if it can.
 *
 * Pure and separate from the uploader so the rules are testable, and so the
 * message names the real limit rather than a hard-coded number that quietly
 * stops matching the bucket.
 */
export function rejectionReason(file: { name: string; type: string; size: number }): string | null {
  const mediaType = mediaTypeOf(file)
  if (!mediaType) return `${file.name} is not a photo or a video`

  if (mediaType === 'video' && !ACCEPTED_VIDEO_TYPES.includes(file.type)) {
    return `${file.name} is a video format the album cannot play — use MP4, MOV or WebM`
  }

  const limit = maxBytesFor(mediaType)
  if (file.size > limit) {
    return `${file.name} is too large (max ${formatBytes(limit)} for a ${mediaType})`
  }

  if (file.size === 0) return `${file.name} is empty`

  return null
}

/** Where a file and, for video, its poster live in the bucket. */
export function storagePathFor(reunionId: string, fileName: string, now = Date.now()): string {
  return `${reunionId}/${now}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`
}

export function thumbnailPathFor(storagePath: string): string {
  return `${storagePath}.poster.jpg`
}

export type PosterFrame = { blob: Blob; durationSeconds: number }

/**
 * Grabs a still from the start of a video, in the browser.
 *
 * There is no ffmpeg or sharp in this project and adding server-side
 * transcoding would be out of all proportion to showing a thumbnail. Without a
 * poster the grid has to load metadata for every video just to render a tile,
 * which is far more bandwidth than a few KB of JPEG.
 *
 * Seeks slightly past zero because the very first frame of a phone video is
 * often black while the sensor settles.
 *
 * Resolves to null rather than throwing on any failure: a missing poster costs
 * a nicer tile, and losing the upload over it would be a much worse trade.
 */
export async function capturePosterFrame(
  file: File,
  seekSeconds = 0.1
): Promise<PosterFrame | null> {
  if (typeof document === 'undefined') return null

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')

  try {
    return await new Promise<PosterFrame | null>((resolve) => {
      // A video that never fires an event would otherwise hang the whole
      // upload behind a promise that never settles.
      const timeout = setTimeout(() => resolve(null), 10_000)

      function done(result: PosterFrame | null) {
        clearTimeout(timeout)
        resolve(result)
      }

      video.onerror = () => done(null)

      video.onloadedmetadata = () => {
        // Clamp: seeking past the end of a very short clip never fires seeked.
        video.currentTime = Math.min(seekSeconds, Math.max(video.duration - 0.01, 0))
      }

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight

          const context = canvas.getContext('2d')
          if (!context || !canvas.width || !canvas.height) return done(null)

          context.drawImage(video, 0, 0, canvas.width, canvas.height)
          canvas.toBlob(
            (blob) =>
              done(
                blob
                  ? { blob, durationSeconds: Math.round(video.duration) || 0 }
                  : null
              ),
            'image/jpeg',
            0.8
          )
        } catch {
          done(null)
        }
      }

      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      video.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * "12 photos and 3 videos" — the album header, which used to always say
 * "photos" however much of it was footage.
 */
export function describeAlbum(items: { media_type?: string | null }[]): string {
  const videos = items.filter((i) => i.media_type === 'video').length
  const photos = items.length - videos

  const parts: string[] = []
  if (photos > 0) parts.push(`${photos} photo${photos === 1 ? '' : 's'}`)
  if (videos > 0) parts.push(`${videos} video${videos === 1 ? '' : 's'}`)

  return parts.length === 0 ? 'Nothing here yet' : parts.join(' and ')
}

/** mm:ss for a tile badge. */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}
