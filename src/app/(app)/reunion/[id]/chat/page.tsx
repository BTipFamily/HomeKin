import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import ChatClient from './chat-client'

interface ChatPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ event?: string }>
}

export default async function ChatPage({ params, searchParams }: ChatPageProps) {
  const { id } = await params
  const { event: subEventId } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, name, photo_url')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) redirect('/login')

  const { data: reunion } = await supabase
    .from('reunions')
    .select('id, name')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  let subEventName: string | null = null
  if (subEventId) {
    const { data: evt } = await supabase
      .from('sub_events')
      .select('name')
      .eq('id', subEventId)
      .single()
    subEventName = evt?.name ?? null
  }

  let messagesQuery = supabase
    .from('messages')
    .select('*, sender:sender_id(id, name, photo_url)')
    .eq('reunion_id', id)
    .order('created_at', { ascending: true })
    .limit(100)

  if (subEventId) {
    messagesQuery = messagesQuery.eq('sub_event_id', subEventId)
  } else {
    messagesQuery = messagesQuery.is('sub_event_id', null)
  }

  const { data: initialMessages } = await messagesQuery

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <Link href={subEventId ? `/reunion/${id}/events/${subEventId}` : `/reunion/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <p className="font-semibold text-sm">{subEventName ?? `${reunion.name} Chat`}</p>
          {subEventName && <p className="text-xs text-muted-foreground">{reunion.name}</p>}
        </div>
      </div>

      <ChatClient
        reunionId={id}
        subEventId={subEventId ?? null}
        initialMessages={initialMessages ?? []}
        currentMember={member}
      />
    </div>
  )
}
