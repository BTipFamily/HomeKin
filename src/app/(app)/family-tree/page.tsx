import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { connectedMemberIds } from '@/lib/family-tree'
import { buildBranchTintMap, tintFor } from '@/lib/branch-tint'
import { canViewField } from '@/lib/visibility'
import {
  FamilyTreeView,
  type TreeMember,
  type TreeRelationship,
} from './family-tree-view'
import type { Role } from '@/types/database'

interface FamilyTreePageProps {
  searchParams: Promise<{ includeUnrelated?: string }>
}

export default async function FamilyTreePage({ searchParams }: FamilyTreePageProps) {
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

  const { includeUnrelated } = await searchParams
  const showUnrelated = includeUnrelated === '1'

  const { data: members } = await supabase
    .from('members')
    .select(
      'id, name, photo_url, family_branch, gender, date_of_birth, visibility_settings, created_by_proxy'
    )
    .order('name')
  const { data: relationships } = await supabase
    .from('relationships')
    .select('member_id, related_member_id, relationship_type, parent_child_kind, partner_status')

  const allMembers = members ?? []
  const allRelationships: TreeRelationship[] = relationships ?? []

  const connectedIds = connectedMemberIds(allRelationships)
  const visibleMembers = showUnrelated
    ? allMembers
    : allMembers.filter((m) => connectedIds.has(m.id))

  // Built from every member, not just the visible ones, so a branch keeps its
  // colour when the unrelated-attendees toggle changes what is on screen.
  const branchTints = buildBranchTintMap(allMembers.map((m) => m.family_branch))
  const viewerRole = (currentMember?.role as Role) ?? 'member'

  const memberLookup: Record<string, TreeMember> = Object.fromEntries(
    visibleMembers.map((m) => {
      const isMe = m.id === currentMember?.id
      // Gated on the same visibility setting the profile page uses. The
      // directory deliberately shows month and day without the year; here the
      // year is the point — it is what separates one generation from the next
      // — so it follows the setting rather than being hidden outright.
      const canSeeBirth =
        isMe || canViewField(m.visibility_settings, 'date_of_birth', viewerRole)

      return [
        m.id,
        {
          id: m.id,
          name: m.name,
          photo_url: m.photo_url,
          family_branch: m.family_branch,
          gender: m.gender,
          tint: tintFor(m.family_branch, branchTints),
          lifespan: m.date_of_birth && canSeeBirth ? `b. ${m.date_of_birth.slice(0, 4)}` : null,
          isProxy: m.created_by_proxy,
        } satisfies TreeMember,
      ]
    })
  )

  const defaultRootId =
    (currentMember && visibleMembers.some((m) => m.id === currentMember.id)
      ? currentMember.id
      : visibleMembers[0]?.id) ?? null

  const hiddenCount = allMembers.length - visibleMembers.length

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Family Tree</h1>
          <p className="text-sm text-muted-foreground">
            {visibleMembers.length} in the tree
            {!showUnrelated && hiddenCount > 0 && ` · ${hiddenCount} without relationships hidden`}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={showUnrelated ? '/family-tree' : '/family-tree?includeUnrelated=1'}>
            {showUnrelated ? 'Hide unrelated attendees' : 'Include unrelated attendees'}
          </Link>
        </Button>
      </div>

      {!defaultRootId ? (
        <div className="py-16 text-center text-muted-foreground">
          <p>No family relationships have been added yet.</p>
          <p className="mt-1 text-sm">
            Add relationships from a member&apos;s{' '}
            <Link href="/directory" className="text-primary hover:underline">
              profile edit page
            </Link>
            .
          </p>
        </div>
      ) : (
        <FamilyTreeView
          members={memberLookup}
          relationships={allRelationships}
          defaultRootId={defaultRootId}
          viewerId={currentMember?.id ?? null}
        />
      )}
    </div>
  )
}
