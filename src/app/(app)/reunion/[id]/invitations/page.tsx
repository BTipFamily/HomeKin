import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Mail, CheckCircle, Clock, Eye } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import InviteForm from './invite-form'

interface InvitationsPageProps {
  params: Promise<{ id: string }>
}

export default async function InvitationsPage({ params }: InvitationsPageProps) {
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
  if (!member || !['committee', 'admin'].includes(member.role)) {
    redirect(`/reunion/${id}`)
  }

  const { data: reunion } = await supabase
    .from('reunions')
    .select('id, name')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  const { data: members } = await supabase
    .from('members')
    .select('id, name, email')
    .order('name')

  const { data: subEvents } = await supabase
    .from('sub_events')
    .select('id, name')
    .eq('reunion_id', id)
    .order('date')

  const { data: invitations } = await supabase
    .from('invitations')
    .select('*, member:member_id(name), sub_event:sub_event_id(name)')
    .eq('reunion_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/reunion/${id}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {reunion.name}
        </Link>
      </Button>

      <h1 className="mb-6 text-2xl font-bold">Invitations</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Send Invitations</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteForm
            reunionId={id}
            members={members ?? []}
            subEvents={subEvents ?? []}
          />
        </CardContent>
      </Card>

      {/* Sent invitations log */}
      {invitations && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sent ({invitations.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {invitations.map((inv) => {
                const m = (inv as any).member
                const evt = (inv as any).sub_event
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-medium">{m?.name ?? 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        {evt?.name ?? 'General reunion'} ·{' '}
                        {inv.sent_at ? formatDate(inv.sent_at) : 'Draft'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {inv.responded_at ? (
                        <Badge className="bg-green-500/10 text-green-700 border-green-200 text-xs">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Responded
                        </Badge>
                      ) : inv.opened_at ? (
                        <Badge variant="outline" className="text-xs">
                          <Eye className="mr-1 h-3 w-3" />
                          Opened
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          <Mail className="mr-1 h-3 w-3" />
                          Sent
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
