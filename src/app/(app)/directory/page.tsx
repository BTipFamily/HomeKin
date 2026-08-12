import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { RoleBadge } from '@/components/role-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getInitials } from '@/lib/utils'
import { canViewField } from '@/lib/visibility'
import { formatBirthdayShort } from '@/lib/birthday'
import { Search, Plus, Cake, FileSpreadsheet } from 'lucide-react'
import type { Member, Role } from '@/types/database'

interface DirectoryPageProps {
  searchParams: Promise<{ q?: string; branch?: string }>
}

export default async function DirectoryPage({ searchParams }: DirectoryPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentMember } = await supabase
    .from('members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()

  const params = await searchParams
  const query = params.q || ''
  const branchFilter = params.branch || ''

  // Build query
  let membersQuery = supabase.from('members').select('*').order('name')
  if (query) {
    membersQuery = membersQuery.ilike('name', `%${query}%`)
  }
  if (branchFilter) {
    membersQuery = membersQuery.eq('family_branch', branchFilter)
  }

  const { data: members } = await membersQuery
  // `.order('name')` sorts by the database's collation, which can put
  // capitalized/accented names out of alphabetical order — re-sort here so
  // the directory always reads A-to-Z regardless of collation.
  members?.sort((a, b) => a.name.localeCompare(b.name))

  // Get unique branches for filter
  const { data: branches } = await supabase
    .from('members')
    .select('family_branch')
    .not('family_branch', 'is', null)
    .order('family_branch')

  const uniqueBranches = [...new Set(branches?.map((b) => b.family_branch).filter(Boolean))]

  const canAdmin = currentMember?.role === 'admin'
  const canManage = ['committee', 'admin'].includes(currentMember?.role ?? '')

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Family Directory</h1>
          <p className="text-sm text-muted-foreground">{members?.length ?? 0} members</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button asChild variant="outline">
              <Link href="/directory/import">
                <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                Import from Spreadsheet
              </Link>
            </Button>
          )}
          {canAdmin && (
            <Button asChild>
              <Link href="/admin/members">
                <Plus className="mr-1.5 h-4 w-4" />
                Add Member
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Search & filters */}
      <form className="mb-6 flex flex-col gap-3 sm:flex-row" method="GET">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={query} placeholder="Search by name..." className="pl-9" />
        </div>
        {uniqueBranches.length > 0 && (
          <select
            name="branch"
            defaultValue={branchFilter}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="">All branches</option>
            {uniqueBranches.map((b) => (
              <option key={b} value={b!}>
                {b}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {(query || branchFilter) && (
          <Button variant="ghost" asChild>
            <Link href="/directory">Clear</Link>
          </Button>
        )}
      </form>

      {/* Member grid */}
      {(!members || members.length === 0) ? (
        <div className="py-16 text-center text-muted-foreground">
          <p>No members found.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {members.map((member: Member) => (
            <MemberCard
              key={member.id}
              member={member}
              currentMemberId={currentMember?.id}
              viewerRole={(currentMember?.role as Role) ?? 'member'}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MemberCard({
  member,
  currentMemberId,
  viewerRole,
}: {
  member: Member
  currentMemberId?: string
  viewerRole: Role
}) {
  const isMe = member.id === currentMemberId
  // Month and day only — the year stays on the profile page, so the directory
  // is useful for spotting birthdays without broadcasting everyone's age.
  const birthday =
    member.date_of_birth &&
    (isMe || canViewField(member.visibility_settings, 'date_of_birth', viewerRole))
      ? formatBirthdayShort(member.date_of_birth)
      : null

  return (
    <Link href={`/directory/${member.id}`}>
      <Card className="group cursor-pointer transition-shadow hover:shadow-md">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <Avatar className="mb-3 h-16 w-16">
              {member.photo_url && (
                <AvatarImage src={member.photo_url} alt={member.name} />
              )}
              <AvatarFallback className="text-lg">{getInitials(member.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 w-full">
              <p className="truncate font-semibold">
                {member.name}
                {isMe && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
              </p>
              {member.family_branch && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {member.family_branch}
                </p>
              )}
              {birthday && (
                <p className="mt-1 flex items-center justify-center gap-1 truncate text-xs text-muted-foreground">
                  <Cake className="h-3 w-3 shrink-0" />
                  {birthday}
                </p>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              {member.role !== 'member' && (
                <RoleBadge role={member.role} className="text-xs" />
              )}
              {member.created_by_proxy && (
                <Badge variant="outline" className="text-xs">
                  Not joined
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
