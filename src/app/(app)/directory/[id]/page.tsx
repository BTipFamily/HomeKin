import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { getInitials } from '@/lib/utils'
import {
  ArrowLeft,
  Edit,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Link2,
} from 'lucide-react'

interface ProfilePageProps {
  params: Promise<{ id: string }>
}

export default async function MemberProfilePage({ params }: ProfilePageProps) {
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

  const isMe = currentMember?.id === member.id
  const canEdit = isMe || ['committee', 'admin'].includes(currentMember?.role ?? '')

  // Determine visibility of contact fields
  const myRole = currentMember?.role ?? 'member'
  const showPhone =
    member.visibility_settings?.phone === 'members' ||
    (member.visibility_settings?.phone === 'committee' &&
      ['committee', 'admin'].includes(myRole))
  const showEmail =
    member.visibility_settings?.email === 'members' ||
    (member.visibility_settings?.email === 'committee' &&
      ['committee', 'admin'].includes(myRole))
  const showAddress =
    member.visibility_settings?.address === 'members' ||
    (member.visibility_settings?.address === 'committee' &&
      ['committee', 'admin'].includes(myRole))

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* Back */}
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/directory">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Directory
        </Link>
      </Button>

      <Card>
        <CardContent className="pt-8">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left sm:gap-6">
            <Avatar className="mb-4 h-24 w-24 sm:mb-0 shrink-0">
              {member.photo_url && (
                <AvatarImage src={member.photo_url} alt={member.name} />
              )}
              <AvatarFallback className="text-2xl">{getInitials(member.name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold">{member.name}</h1>
                  {member.family_branch && (
                    <p className="text-muted-foreground">{member.family_branch}</p>
                  )}
                  <div className="mt-2 flex items-center justify-center sm:justify-start gap-2">
                    {member.role !== 'member' && (
                      <Badge variant="secondary" className="capitalize">
                        {member.role}
                      </Badge>
                    )}
                    {member.created_by_proxy && (
                      <Badge variant="outline">Profile not claimed</Badge>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link href={`/directory/${member.id}/edit`}>
                      <Edit className="mr-1.5 h-4 w-4" />
                      Edit Profile
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {member.bio && (
            <>
              <Separator className="my-6" />
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{member.bio}</p>
            </>
          )}

          <Separator className="my-6" />

          {/* Contact info */}
          <div className="space-y-3">
            {showEmail && member.email && (
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${member.email}`} className="hover:underline text-primary">
                  {member.email}
                </a>
              </div>
            )}
            {showPhone && member.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`tel:${member.phone}`} className="hover:underline">
                  {member.phone}
                </a>
              </div>
            )}
            {showAddress && member.address && (
              <div className="flex items-start gap-3 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <span className="whitespace-pre-wrap">{member.address}</span>
              </div>
            )}
          </div>

          {/* Social links */}
          {(member.social_links?.facebook ||
            member.social_links?.instagram ||
            member.social_links?.linkedin) && (
            <>
              <Separator className="my-6" />
              <div className="flex flex-wrap gap-3">
                {member.social_links.facebook && (
                  <a
                    href={member.social_links.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Link2 className="h-4 w-4" /> Facebook
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {member.social_links.instagram && (
                  <a
                    href={member.social_links.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Link2 className="h-4 w-4" /> Instagram
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {member.social_links.linkedin && (
                  <a
                    href={member.social_links.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Link2 className="h-4 w-4" /> LinkedIn
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
