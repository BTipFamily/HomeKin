'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { getInitials } from '@/lib/utils'
import { updateProfilePhoto } from '@/lib/actions/members'
import { Camera, Loader2 } from 'lucide-react'

interface ProfilePhotoUploadProps {
  memberId: string
  currentPhotoUrl: string | null
  memberName: string
}

export function ProfilePhotoUpload({ memberId, currentPhotoUrl, memberName }: ProfilePhotoUploadProps) {
  const [photoUrl, setPhotoUrl] = useState(currentPhotoUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB')
      return
    }

    setUploading(true)
    setError('')

    const supabase = createClient()
    const path = `${memberId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

    // Upload an ArrayBuffer rather than the File directly: Safari has a
    // long-standing WebKit bug where fetch() sends a FormData body
    // containing a File/Blob with Content-Length: 0 on cross-origin
    // requests (which this is, browser -> supabase.co), so the server
    // sees an empty body ("No content provided"). An ArrayBuffer body
    // skips the FormData-wrapping path in storage-js entirely.
    const fileBuffer = await file.arrayBuffer()

    const { error: uploadError } = await supabase.storage
      .from('profile-photos')
      .upload(path, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      })

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
    await updateProfilePhoto(memberId, data.publicUrl)
    setPhotoUrl(data.publicUrl)
    setUploading(false)
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar className="h-20 w-20">
          {photoUrl && <AvatarImage src={photoUrl} alt={memberName} />}
          <AvatarFallback className="text-xl">{getInitials(memberName)}</AvatarFallback>
        </Avatar>
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </div>
        )}
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <Camera className="mr-1.5 h-4 w-4" />
          {uploading ? 'Uploading...' : 'Change Photo'}
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">JPG, PNG, GIF up to 5MB</p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
