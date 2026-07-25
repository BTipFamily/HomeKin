import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import ImportClient from './import-client'

export default async function DirectoryImportPage() {
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

  if (!member || !['committee', 'admin'].includes(member.role)) redirect('/directory')

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/directory">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Directory
        </Link>
      </Button>

      <h1 className="text-2xl font-bold">Import Members from a Spreadsheet</h1>
      <p className="mt-1 text-muted-foreground">
        Add many family members at once — along with their parents and spouses — from an Excel
        (.xlsx) or CSV file.
      </p>

      <div className="mt-6">
        <ImportClient isAdmin={member.role === 'admin'} />
      </div>
    </div>
  )
}
