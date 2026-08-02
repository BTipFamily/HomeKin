import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { PhotoGrid } from './photo-grid'
import { PhotoUploader } from './photo-uploader'
import {
  groupComments,
  summarizeLikes,
  type LikeRow,
  type PhotoComment,
} from '@/lib/photo-social'

interface PhotosPageProps {
  params: Promise<{ id: string }>
}

export default async function PhotosPage({ params }: PhotosPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, name, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) redirect('/login')

  const { data: reunion } = await supabase
    .from('reunions')
    .select('id, name')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  const { data: photos } = await supabase
    .from('photos')
    .select('*, uploader:uploaded_by(id, name, photo_url)')
    .eq('reunion_id', id)
    .order('created_at', { ascending: false })

  // The `photos` bucket is private, so getPublicUrl() doesn't work here —
  // it returns a URL that 400s since there's no public access. Generate
  // time-limited signed URLs instead (RLS only requires SELECT on
  // storage.objects, which authenticated members already have).
  const paths = (photos ?? []).map((p) => p.storage_path)
  const { data: signedUrls } =
    paths.length > 0
      ? await supabase.storage.from('photos').createSignedUrls(paths, 60 * 60)
      : { data: [] }

  const urlByPath = Object.fromEntries(
    (signedUrls ?? []).map((s) => [s.path, s.signedUrl]).filter(([path]) => path)
  )

  const photosWithUrls = (photos ?? []).map((photo) => ({
    ...photo,
    public_url: urlByPath[photo.storage_path] ?? '',
  }))

  // Likes and comments for the whole album in one query each, grouped in
  // memory. A count query per photo would be a round trip per tile.
  const photoIds = photosWithUrls.map((p) => p.id)
  const [{ data: likeRows }, { data: commentRows }] =
    photoIds.length > 0
      ? await Promise.all([
          supabase.from('photo_likes').select('photo_id, member:member_id(id, name)').in('photo_id', photoIds),
          supabase
            .from('photo_comments')
            .select('id, photo_id, body, created_at, author:author_id(id, name, photo_url)')
            .in('photo_id', photoIds)
            .order('created_at'),
        ])
      : [{ data: [] }, { data: [] }]

  const likesByPhoto = summarizeLikes((likeRows ?? []) as unknown as LikeRow[], member.id)
  const commentsByPhoto = groupComments((commentRows ?? []) as unknown as PhotoComment[])

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
            <Link href={`/reunion/${id}`}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              {reunion.name}
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Photo Album</h1>
          <p className="text-sm text-muted-foreground">{photosWithUrls.length} photos</p>
        </div>
      </div>

      {/* Upload section */}
      <PhotoUploader reunionId={id} memberId={member.id} />

      {/* Photo grid */}
      {photosWithUrls.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p>No photos yet. Be the first to share a memory!</p>
        </div>
      ) : (
        <PhotoGrid
          photos={photosWithUrls}
          currentMemberId={member.id}
          currentMemberName={member.name}
          currentMemberRole={member.role}
          reunionId={id}
          likesByPhoto={likesByPhoto}
          commentsByPhoto={commentsByPhoto}
        />
      )}
    </div>
  )
}
