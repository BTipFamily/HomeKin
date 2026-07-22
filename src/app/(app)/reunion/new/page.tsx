import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import ReunionWizard from './reunion-wizard'

export default async function NewReunionPage() {
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

  if (!['committee', 'admin'].includes(member?.role ?? '')) redirect('/dashboard')

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/dashboard">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Dashboard
        </Link>
      </Button>

      <ReunionWizard />
    </div>
  )
}
