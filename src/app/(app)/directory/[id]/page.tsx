import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { getInitials } from '@/lib/utils'
import { canViewField } from '@/lib/visibility'
import { calculateAge, formatBirthday } from '@/lib/birthday'
import { summarizeHistory } from '@/lib/member-history'
import { getMemberHistory } from '@/lib/actions/member-history'
import { MemberHistoryView } from '@/components/member-history-view'
import {
  ArrowLeft,
  Cake,
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
  const showPhone = canViewField(member.visibility_settings, 'phone', myRole)
  const showEmail = canViewField(member.visibility_settings, 'email', myRole)
  const showAddress = canViewField(member.visibility_settings, 'address', myRole)
  // Your own birth date is always visible to you, whatever the setting says.
  const showBirthday =
    isMe || canViewField(member.visibility_settings, 'date_of_birth', myRole)
  const age = member.date_of_birth ? calculateAge(member.date_of_birth) : null

  // Money is not directory information: a member sees their own, the committee
  // sees everyone's, and nobody else sees any of it.
  const isCommittee = ['committee', 'admin'].includes(myRole)
  const canViewHistory = isMe || isCommittee

  // No filtering here: the select policy on member_support_needs decides who
  // gets a row, so this returns nothing at all for someone who may not see it.
  // That is the difference from the contact fields above, which are filtered
  // at render time over data the query returned regardless. See migration 030.
  const { data: supportNeeds } = await supabase
    .from('member_support_needs')
    .select('dietary_notes, health_notes, mobility_notes, share_with_family')
    .eq('member_id', member.id)
    .maybeSingle()

  const hasSupportNeeds = Boolean(
    supportNeeds?.dietary_notes || supportNeeds?.health_notes || supportNeeds?.mobility_notes
  )
  const history = canViewHistory
    ? await getMemberHistory(member.id)
    : { entries: [], totals: summarizeHistory([]) }

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
            {showBirthday && member.date_of_birth && (
              <div className="flex items-center gap-3 text-sm">
                <Cake className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>
                  {formatBirthday(member.date_of_birth)}
                  {age !== null && (
                    <span className="text-muted-foreground"> — {age} years old</span>
                  )}
                </span>
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

      {/* Reunion history — your own always, anyone's for committee and admin. */}
      {hasSupportNeeds && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Dietary, health and mobility</CardTitle>
            <CardDescription>
              {supportNeeds?.share_with_family
                ? 'Shared with the family.'
                : 'Visible to you, the committee and admins.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {supportNeeds?.dietary_notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Dietary
                </p>
                <p>{supportNeeds.dietary_notes}</p>
              </div>
            )}
            {supportNeeds?.health_notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Health
                </p>
                <p>{supportNeeds.health_notes}</p>
              </div>
            )}
            {supportNeeds?.mobility_notes && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Mobility
                </p>
                <p>{supportNeeds.mobility_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {member.volunteer_interest && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Happy to help</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {(member.volunteer_areas ?? []).length > 0
              ? (member.volunteer_areas as string[]).join(', ')
              : 'Willing to lend a hand.'}
          </CardContent>
        </Card>
      )}

      {canViewHistory && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Reunion History</CardTitle>
          </CardHeader>
          <CardContent>
            <MemberHistoryView
              entries={history.entries}
              totals={history.totals}
              showPayments={isMe || isCommittee}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
