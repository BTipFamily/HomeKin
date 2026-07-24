import { createClient } from '@/lib/supabase/server'
import { TEMPLATE_CSV } from '@/lib/member-import'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member } = await supabase
    .from('members')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (!member || !['committee', 'admin'].includes(member.role)) {
    return Response.json({ error: 'Committee or admin access required' }, { status: 403 })
  }

  // Lead with a BOM so Excel opens the file as UTF-8 rather than mangling
  // accented names.
  return new Response('﻿' + TEMPLATE_CSV, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="homekin-directory-template.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
