import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { TimelineOptions } from '@/lib/timeline-generator'
import { TimelinePageClient } from './timeline-page-client'

interface TimelinePageProps {
  params: Promise<{ id: string }>
}

export default async function TimelinePage({ params }: TimelinePageProps) {
  const { id } = await params
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
  if (!member) redirect('/login')

  const { data: reunion } = await supabase
    .from('reunions')
    .select('id, name, start_date, end_date')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  const { data: items } = await supabase
    .from('reunion_timeline_items')
    .select('*')
    .eq('reunion_id', id)
    .order('due_date', { ascending: true })
    .order('sort_order', { ascending: true })

  const canManage = ['committee', 'admin'].includes(member.role)

  const existingCategories = new Set((items ?? []).map((i) => i.category))
  const initialRegenOptions: TimelineOptions = {
    multiDay: !!reunion.end_date,
    lodging: existingCategories.has('lodging') || (items ?? []).length === 0,
    merchandise: existingCategories.has('merchandise') || (items ?? []).length === 0,
    heritage: existingCategories.has('heritage'),
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 print:hidden">
        <Link href={`/reunion/${id}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {reunion.name}
        </Link>
      </Button>

      <h1 className="mb-6 text-2xl font-bold print:hidden">{reunion.name} — Timeline</h1>

      {!reunion.start_date ? (
        <p className="text-sm text-muted-foreground">
          Set a reunion date from{' '}
          <Link href={`/reunion/${id}/manage`} className="underline">
            Manage Reunion
          </Link>{' '}
          before building a timeline.
        </p>
      ) : (
        <TimelinePageClient
          reunionId={id}
          reunionName={reunion.name}
          startDate={reunion.start_date}
          items={items ?? []}
          canManage={canManage}
          initialRegenOptions={initialRegenOptions}
        />
      )}
    </div>
  )
}
