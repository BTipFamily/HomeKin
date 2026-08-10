import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ArrowLeft, ShieldOff, FileText, Pencil } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { unblockMember } from '@/lib/actions/moderation'
import { ActionButton } from '@/components/action-button'
import { RoleBadge } from '@/components/role-badge'
import { DeleteAccount } from './delete-account'

/**
 * Your account: who you are here, who you have blocked, and how to leave.
 *
 * A route of its own rather than a section of the profile editor, for two
 * reasons. Blocking is not part of a profile, and an App Store reviewer has to
 * be able to find account deletion without reading the app first — it is linked
 * directly from the avatar menu.
 */
export default async function AccountPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, name, email, role, photo_url')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) redirect('/login')

  // Only your own rows are visible here — the policy in migration 035 sees to
  // that, so nobody can enumerate who has blocked them.
  const { data: blocks } = await supabase
    .from('member_blocks')
    .select('blocked_id, created_at, blocked:blocked_id(id, name, photo_url)')
    .eq('blocker_id', member.id)
    .order('created_at', { ascending: false })

  // An embedded row comes back as an object or an array depending on how the
  // relationship is inferred; normalised here so the markup below need not care.
  type BlockedMember = { id: string; name: string; photo_url: string | null }
  const blocked = (blocks ?? []).map((row) => {
    const embedded = row.blocked as BlockedMember | BlockedMember[] | null
    const one = Array.isArray(embedded) ? embedded[0] : embedded
    return {
      id: one?.id ?? row.blocked_id,
      name: one?.name ?? 'Unknown',
      photoUrl: one?.photo_url ?? null,
    }
  })

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/dashboard">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Dashboard
        </Link>
      </Button>

      <h1 className="mb-6 text-2xl font-bold">Your Account</h1>

      <Card className="mb-6">
        <CardContent className="flex items-center gap-4 pt-6">
          <Avatar className="h-14 w-14">
            {member.photo_url && <AvatarImage src={member.photo_url} alt={member.name} />}
            <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{member.name}</p>
            <p className="truncate text-sm text-muted-foreground">{member.email}</p>
            <div className="mt-1">
              <RoleBadge role={member.role} />
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/directory/${member.id}/edit`}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit profile
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldOff className="h-4 w-4" />
            Blocked people
          </CardTitle>
          <CardDescription>
            You do not see their photos, comments or messages, and they do not see yours. They are
            not told, and lifting a block does not tell them either.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {blocked.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You have not blocked anybody. You can block someone from their profile, or from any
              photo, comment or message of theirs.
            </p>
          ) : (
            <ul className="space-y-2">
              {blocked.map((person) => (
                <li
                  key={person.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar className="h-7 w-7">
                      {person.photoUrl && <AvatarImage src={person.photoUrl} alt={person.name} />}
                      <AvatarFallback className="text-xs">
                        {getInitials(person.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-medium">{person.name}</span>
                  </div>
                  <ActionButton
                    action={unblockMember.bind(null, person.id)}
                    label={`Unblock ${person.name}`}
                    variant="outline"
                    size="sm"
                    messageClassName="w-40 text-right"
                  >
                    Unblock
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            The rules and your privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/terms">Terms of Use</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/privacy">Privacy Policy</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Delete your account</CardTitle>
          <CardDescription>
            Removes your profile and everything belonging to it from the family directory,
            permanently. Photographs you uploaded and messages you sent stay where they are but
            stop carrying your name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccount />
        </CardContent>
      </Card>
    </div>
  )
}
