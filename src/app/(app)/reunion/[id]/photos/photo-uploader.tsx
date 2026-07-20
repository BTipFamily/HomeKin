'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Upload, Loader2, X, ImagePlus } from 'lucide-react'

interface PhotoUploaderProps {
  reunionId: string
  memberId: string
}

export function PhotoUploader({ reunionId, memberId }: PhotoUploaderProps) {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    setFiles((prev) => [...prev, ...selected].slice(0, 10))
    setError('')
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleUpload() {
    if (files.length === 0) return
    setUploading(true)
    setError('')

    const supabase = createClient()
    const results: string[] = []

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`${file.name} is too large (max 10MB)`)
        setUploading(false)
        return
      }

      const path = `${reunionId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

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
        setError(uploadError.message)
        setUploading(false)
        return
      }

      // Save to photos table
      const { error: dbError } = await supabase.from('photos').insert({
        reunion_id: reunionId,
        uploaded_by: memberId,
        storage_path: path,
        caption: caption || null,
      })

      if (dbError) {
        setError(dbError.message)
        setUploading(false)
        return
      }

      results.push(path)
    }

    setFiles([])
    setCaption('')
    setUploading(false)
    router.refresh()
  }

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
              Click to select photos (up to 10 at a time, 10MB each)
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
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
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="h-16 w-16 rounded-md object-cover"
                    />
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
                  placeholder="Add a caption for these photos..."
                  className="h-8 text-sm"
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex gap-2">
                <Button size="sm" onClick={handleUpload} disabled={uploading}>
                  {uploading ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="mr-1.5 h-3.5 w-3.5" /> Upload {files.length} {files.length === 1 ? 'photo' : 'photos'}</>
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
