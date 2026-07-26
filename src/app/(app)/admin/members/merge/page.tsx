import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { findDuplicateMembers } from '@/lib/actions/member-merge'
import MergeClient from './merge-client'

export default async function MergeMembersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (member?.role !== 'admin') redirect('/directory')

  const pairs = await findDuplicateMembers()

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/admin/members">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Manage Members
        </Link>
      </Button>

      <h1 className="text-2xl font-bold">Merge Duplicate Profiles</h1>
      <p className="mt-1 text-muted-foreground">
        When someone already in the directory signs up with a different email address, they end
        up with a second profile. Merging folds one into the other, moving their signups,
        balances, relationships and photos across.
      </p>

      <div className="mt-6">
        <MergeClient initialPairs={pairs} />
      </div>
    </div>
  )
}
