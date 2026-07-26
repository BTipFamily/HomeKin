import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = request.nextUrl
  const reunionId = searchParams.get('reunion_id')
  const subEventId = searchParams.get('sub_event_id') // null = general chat
  const since = searchParams.get('since') // ISO timestamp

  if (!reunionId) return Response.json({ error: 'reunion_id required' }, { status: 400 })

  let query = supabase
    .from('messages')
    .select('*, sender:sender_id(id, name, photo_url)')
    .eq('reunion_id', reunionId)
    .order('created_at', { ascending: true })
    .limit(100)

  if (subEventId) {
    query = query.eq('sub_event_id', subEventId)
  } else {
    query = query.is('sub_event_id', null)
  }

  if (since) {
    query = query.gt('created_at', since)
  }

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Piggy-backed on the poll the chat already makes, rather than a second timer
  // firing on its own schedule.
  const { data: roster } = await supabase
    .from('members')
    .select('id, name, photo_url, last_seen_at')
    .order('name')

  return Response.json({ messages: data ?? [], roster: roster ?? [] })
}
