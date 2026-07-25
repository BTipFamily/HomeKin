import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, X } from 'lucide-react'
import { updateMemberProfile } from '@/lib/actions/members'
import { deleteRelationship } from '@/lib/actions/relationships'
import { getInitials } from '@/lib/utils'
import { MIN_BIRTH_YEAR } from '@/lib/birthday'
import type { Relationship } from '@/types/database'
import { ProfilePhotoUpload } from './photo-upload'
import { RelationshipPicker } from './relationship-picker'

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

  const { data: relationshipRows } = await supabase
    .from('relationships')
    .select('*')
    .or(`member_id.eq.${id},related_member_id.eq.${id}`)
    .order('created_at')

  const relationships = relationshipRows ?? []
  const otherPartyIds = [
    ...new Set(relationships.map((r) => (r.member_id === id ? r.related_member_id : r.member_id))),
  ]

  const { data: otherPartyRows } = otherPartyIds.length
    ? await supabase.from('members').select('id, name, photo_url').in('id', otherPartyIds)
    : { data: [] }

  const otherPartyLookup = Object.fromEntries((otherPartyRows ?? []).map((m) => [m.id, m]))

  const today = new Date().toISOString().slice(0, 10)

  function describeRelationship(rel: Relationship): string {
    const other = otherPartyLookup[rel.member_id === id ? rel.related_member_id : rel.member_id]
    const otherName = other?.name ?? 'Unknown'

    if (rel.relationship_type === 'parent_child') {
      const kindLabel = rel.parent_child_kind ? ` (${rel.parent_child_kind})` : ''
      return rel.member_id === id
        ? `Parent of ${otherName}${kindLabel}`
        : `Child of ${otherName}${kindLabel}`
    }
    if (rel.relationship_type === 'partner') {
      const statusLabel = rel.partner_status ?? 'partner'
      return `${statusLabel.charAt(0).toUpperCase()}${statusLabel.slice(1)} to ${otherName}`
    }
    return `${rel.custom_label ?? 'Related'} — ${otherName}`
  }

  async function handleSubmit(formData: FormData) {
    'use server'
    formData.set('member_id', id)
    await updateMemberProfile(formData)
    redirect(`/directory/${id}`)
  }

  async function handleDeleteRelationship(formData: FormData) {
    'use server'
    const relationshipId = formData.get('relationship_id') as string
    const memberId = formData.get('member_id') as string
    const relatedMemberId = formData.get('related_member_id') as string
    await deleteRelationship(relationshipId, [memberId, relatedMemberId])
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
              <Label htmlFor="date_of_birth">Date of Birth</Label>
              <Input
                id="date_of_birth"
                name="date_of_birth"
                type="date"
                defaultValue={member.date_of_birth ?? ''}
                min={`${MIN_BIRTH_YEAR}-01-01`}
                max={today}
                className="w-full sm:w-56"
              />
              <p className="text-xs text-muted-foreground">
                Shown on your profile with your age. Leave blank to keep it private.
              </p>
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Family Relationships</CardTitle>
          <CardDescription>
            Link parents, children, spouses, and other relations. These show up on the{' '}
            <Link href="/family-tree" className="text-primary hover:underline">
              Family Tree
            </Link>
            . Members with no relationships added are left out of that view.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {relationships.length > 0 && (
            <ul className="space-y-2">
              {relationships.map((rel) => {
                const other =
                  otherPartyLookup[rel.member_id === id ? rel.related_member_id : rel.member_id]
                return (
                  <li
                    key={rel.id}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-7 w-7 shrink-0">
                        {other?.photo_url && (
                          <AvatarImage src={other.photo_url} alt={other?.name ?? ''} />
                        )}
                        <AvatarFallback className="text-xs">
                          {getInitials(other?.name ?? '?')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-sm">{describeRelationship(rel)}</span>
                    </div>
                    <form action={handleDeleteRelationship}>
                      <input type="hidden" name="relationship_id" value={rel.id} />
                      <input type="hidden" name="member_id" value={rel.member_id} />
                      <input type="hidden" name="related_member_id" value={rel.related_member_id} />
                      <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                        <X className="h-4 w-4" />
                      </Button>
                    </form>
                  </li>
                )
              })}
            </ul>
          )}

          <RelationshipPicker memberId={id} />
        </CardContent>
      </Card>
    </div>
  )
}
