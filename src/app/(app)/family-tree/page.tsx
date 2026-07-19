import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { buildFamilyTreeNodes, connectedMemberIds } from '@/lib/family-tree'
import { FamilyTreeView } from './family-tree-view'

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
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  const { includeUnrelated } = await searchParams
  const showUnrelated = includeUnrelated === '1'

  const { data: members } = await supabase
    .from('members')
    .select('id, name, photo_url, family_branch, gender')
    .order('name')
  const { data: relationships } = await supabase.from('relationships').select('*')

  const allMembers = members ?? []
  const allRelationships = relationships ?? []

  const connectedIds = connectedMemberIds(allRelationships)
  const visibleMembers = showUnrelated
    ? allMembers
    : allMembers.filter((m) => connectedIds.has(m.id))

  const nodes = buildFamilyTreeNodes(visibleMembers, allRelationships)

  const memberLookup = Object.fromEntries(
    visibleMembers.map((m) => [
      m.id,
      { name: m.name, photo_url: m.photo_url, family_branch: m.family_branch },
    ])
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
            {visibleMembers.length} shown
            {!showUnrelated && hiddenCount > 0 && ` · ${hiddenCount} without relationships hidden`}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={showUnrelated ? '/family-tree' : '/family-tree?includeUnrelated=1'}>
            {showUnrelated ? 'Hide unrelated attendees' : 'Include unrelated attendees'}
          </Link>
        </Button>
      </div>

      {nodes.length === 0 || !defaultRootId ? (
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
        <FamilyTreeView nodes={nodes} members={memberLookup} defaultRootId={defaultRootId} />
      )}
    </div>
  )
}
