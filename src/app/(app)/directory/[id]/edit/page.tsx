import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft } from 'lucide-react'
import { updateMemberProfile } from '@/lib/actions/members'
import { ProfilePhotoUpload } from './photo-upload'

interface EditProfilePageProps {
  params: Promise<{ id: string }>
}

export default async function EditProfilePage({ params }: EditProfilePageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params

  const { data: currentMember } = await supabase
    .from('members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()

  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('id', id)
    .single()

  if (!member) notFound()

  // Only own profile or admin/committee can edit
  const canEdit =
    currentMember?.id === member.id ||
    ['committee', 'admin'].includes(currentMember?.role ?? '')
  if (!canEdit) redirect(`/directory/${id}`)

  async function handleSubmit(formData: FormData) {
    'use server'
    formData.set('member_id', id)
    await updateMemberProfile(formData)
    redirect(`/directory/${id}`)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/directory/${id}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to profile
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
          <CardDescription>Update your information visible to family members.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Photo upload */}
          <ProfilePhotoUpload
            memberId={id}
            currentPhotoUrl={member.photo_url}
            memberName={member.name}
          />

          <Separator className="my-6" />

          <form action={handleSubmit} className="space-y-4">
            <input type="hidden" name="member_id" value={id} />

            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                name="name"
                defaultValue={member.name}
                required
                placeholder="Jane Smith"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="family_branch">Family Branch</Label>
              <Input
                id="family_branch"
                name="family_branch"
                defaultValue={member.family_branch ?? ''}
                placeholder="e.g. Grandma Rose's side"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={member.phone ?? ''}
                placeholder="(555) 555-5555"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                name="address"
                defaultValue={member.address ?? ''}
                placeholder="123 Main St, City, State 12345"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                name="bio"
                defaultValue={member.bio ?? ''}
                placeholder="Tell the family a bit about yourself..."
                rows={4}
              />
            </div>

            <Separator />
            <p className="text-sm font-medium">Social Links</p>

            <div className="space-y-2">
              <Label htmlFor="facebook">Facebook URL</Label>
              <Input
                id="facebook"
                name="facebook"
                type="url"
                defaultValue={member.social_links?.facebook ?? ''}
                placeholder="https://facebook.com/yourname"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instagram">Instagram URL</Label>
              <Input
                id="instagram"
                name="instagram"
                type="url"
                defaultValue={member.social_links?.instagram ?? ''}
                placeholder="https://instagram.com/yourname"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedin">LinkedIn URL</Label>
              <Input
                id="linkedin"
                name="linkedin"
                type="url"
                defaultValue={member.social_links?.linkedin ?? ''}
                placeholder="https://linkedin.com/in/yourname"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit">Save Changes</Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/directory/${id}`}>Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
