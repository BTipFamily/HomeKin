import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, FileSpreadsheet, Merge } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import { updateMemberRole } from '@/lib/actions/members'
import { createProxyMember } from '@/lib/actions/members'
import { MIN_BIRTH_YEAR } from '@/lib/birthday'
import { DeleteMemberButton } from './delete-member-button'
import { InviteMemberButton } from './invite-member-button'
import { RoleBadge } from '@/components/role-badge'
import { ActionForm } from '@/components/action-form'
import { ActionButton } from '@/components/action-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Role } from '@/types/database'

export default async function AdminMembersPage() {
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

  if (currentMember?.role !== 'admin') redirect('/dashboard')

  const { data: members } = await supabase
    .from('members')
    .select('*')
    .order('name')

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/admin">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Admin
        </Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Manage Members</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/directory/import">
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              Import from Spreadsheet
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/members/merge">
              <Merge className="mr-1.5 h-4 w-4" />
              Merge Duplicates
            </Link>
          </Button>
        </div>
      </div>

      {/* Add proxy member */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Add a Member Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={createProxyMember}
            submitLabel="Create Profile"
            pendingLabel="Creating…"
            errorTitle="That profile was not created"
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="space-y-1">
              <Label htmlFor="name">Full Name *</Label>
              <Input id="name" name="name" required placeholder="Jane Smith" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" name="email" type="email" required placeholder="jane@example.com" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" type="tel" placeholder="(555) 555-5555" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="family_branch">Family Branch</Label>
              <Input id="family_branch" name="family_branch" placeholder="e.g. Grandma Rose's side" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="date_of_birth">Date of Birth</Label>
              <Input
                id="date_of_birth"
                name="date_of_birth"
                type="date"
                min={`${MIN_BIRTH_YEAR}-01-01`}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              This creates a placeholder profile. They can claim it by signing up with the same email.
            </p>
          </ActionForm>
        </CardContent>
      </Card>

      {/* Member list */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members?.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    {member.photo_url && <AvatarImage src={member.photo_url} alt={member.name} />}
                    <AvatarFallback className="text-xs">{getInitials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {member.family_branch ?? '—'}
              </TableCell>
              <TableCell>
                {member.created_by_proxy ? (
                  <Badge variant="outline">Not joined</Badge>
                ) : (
                  <Badge variant="secondary">Active</Badge>
                )}
              </TableCell>
              <TableCell>
                <RoleBadge role={member.role} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {member.id !== currentMember?.id && (
                    <>
                      {(['member', 'committee', 'admin'] as const)
                        .filter((role) => role !== member.role)
                        .map((role) => (
                          <ActionButton
                            key={role}
                            action={updateMemberRole.bind(null, member.id, role)}
                            label={`Make ${member.name} ${role}`}
                            size="sm"
                            className="text-xs"
                          >
                            → {role.charAt(0).toUpperCase() + role.slice(1)}
                          </ActionButton>
                        ))}
                    </>
                  )}
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/directory/${member.id}`}>View</Link>
                  </Button>
                  {/* Only the profiles nobody has claimed — anyone already
                      signed in has no use for a signup link. */}
                  {member.created_by_proxy && (
                    <InviteMemberButton
                      memberId={member.id}
                      memberName={member.name}
                      memberEmail={member.email}
                    />
                  )}
                  <DeleteMemberButton
                    memberId={member.id}
                    memberName={member.name}
                    isSelf={member.id === currentMember?.id}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
