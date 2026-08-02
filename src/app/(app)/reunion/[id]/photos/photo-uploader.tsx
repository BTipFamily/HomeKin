'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Upload, Loader2, X, ImagePlus, Play } from 'lucide-react'
import {
  MAX_BATCH_FILES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  capturePosterFrame,
  formatBytes,
  mediaTypeOf,
  rejectionReason,
  storagePathFor,
  thumbnailPathFor,
} from '@/lib/media'

interface PhotoUploaderProps {
  reunionId: string
  memberId: string
}

export function PhotoUploader({ reunionId, memberId }: PhotoUploaderProps) {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  // Which file of how many, so a 100MB clip does not look like a hang.
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? [])
    const accepted = chosen.filter((f) => mediaTypeOf(f) !== null)
    const rejected = chosen.length - accepted.length

    setFiles((prev) => [...prev, ...accepted].slice(0, MAX_BATCH_FILES))
    // Silently dropping a file is what made this confusing before: a member
    // picked a clip, nothing appeared, and nothing said why.
    setError(rejected > 0 ? `${rejected} file(s) skipped — only photos and videos can be uploaded` : '')
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function fail(message: string) {
    setError(message)
    setUploading(false)
    setProgress(null)
  }

  async function handleUpload() {
    if (files.length === 0) return
    setUploading(true)
    setError('')

    // Check everything before uploading anything: failing on file three of
    // four leaves the first two already committed and no way to tell.
    for (const file of files) {
      const reason = rejectionReason(file)
      if (reason) return fail(reason)
    }

    const supabase = createClient()

    for (const [index, file] of files.entries()) {
      setProgress({ current: index + 1, total: files.length })

      const mediaType = mediaTypeOf(file)!
      const path = storagePathFor(reunionId, file.name)

      // A poster for the grid, captured before the upload so a failure here
      // costs nothing that has already been committed.
      let thumbnailPath: string | null = null
      let durationSeconds: number | null = null

      if (mediaType === 'video') {
        const poster = await capturePosterFrame(file)
        if (poster) {
          durationSeconds = poster.durationSeconds
          const posterPath = thumbnailPathFor(path)
          const { error: posterError } = await supabase.storage
            .from('photos')
            .upload(posterPath, await poster.blob.arrayBuffer(), {
              contentType: 'image/jpeg',
              upsert: false,
            })
          // A missing poster is survivable — the grid falls back to the video
          // element. Losing the upload over it would not be.
          if (!posterError) thumbnailPath = posterPath
        }
      }

      // Upload an ArrayBuffer rather than the File directly: Safari has a
      // long-standing WebKit bug where fetch() sends a FormData body
      // containing a File/Blob with Content-Length: 0 on cross-origin
      // requests (which this is, browser -> supabase.co), so the server
      // sees an empty body ("No content provided"). An ArrayBuffer body
      // skips the FormData-wrapping path in storage-js entirely.
      const fileBuffer = await file.arrayBuffer()

      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(path, fileBuffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })

      if (uploadError) {
        // Do not leave the poster behind for a video whose upload failed.
        if (thumbnailPath) await supabase.storage.from('photos').remove([thumbnailPath])
        return fail(uploadError.message)
      }

      const { error: dbError } = await supabase.from('photos').insert({
        reunion_id: reunionId,
        uploaded_by: memberId,
        storage_path: path,
        caption: caption || null,
        media_type: mediaType,
        thumbnail_path: thumbnailPath,
        duration_seconds: durationSeconds,
      })

      if (dbError) return fail(dbError.message)
    }

    setFiles([])
    setCaption('')
    setUploading(false)
    setProgress(null)
    router.refresh()
  }

  const videoCount = files.filter((f) => mediaTypeOf(f) === 'video').length

  return (
    <Card className="mb-6">
      <CardContent className="pt-4">
        <div className="space-y-3">
          <div
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 hover:border-primary/40 hover:bg-muted/30 transition-colors"
          >
            <ImagePlus className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Click to select photos or videos (up to {MAX_BATCH_FILES} at a time)
            </p>
            <p className="text-xs text-muted-foreground/70">
              {formatBytes(MAX_IMAGE_BYTES)} per photo, {formatBytes(MAX_VIDEO_BYTES)} per video
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {files.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                {files.map((file, i) => (
                  <div key={i} className="group relative">
                    {mediaTypeOf(file) === 'video' ? (
                      <div className="flex h-16 w-16 items-center justify-center rounded-md bg-muted">
                        <Play className="h-5 w-5 text-muted-foreground" />
                      </div>
                    ) : (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="h-16 w-16 rounded-md object-cover"
                      />
                    )}
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <Label htmlFor="caption" className="text-xs">Caption (optional)</Label>
                <Input
                  id="caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add a caption for these files..."
                  className="h-8 text-sm"
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              {uploading && progress && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  Uploading {progress.current} of {progress.total}
                  {videoCount > 0 && ' — video can take a while, please keep this tab open'}
                </p>
              )}

              <div className="flex gap-2">
                <Button size="sm" onClick={handleUpload} disabled={uploading}>
                  {uploading ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="mr-1.5 h-3.5 w-3.5" /> Upload {files.length} {files.length === 1 ? 'file' : 'files'}</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFiles([])}
                  disabled={uploading}
                >
                  Clear
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
