import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Calendar, DollarSign, Users, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { formatDate, formatTime, formatCurrency } from '@/lib/utils'
import PayButton from './pay-button'
import ManualPayForm from './manual-pay-form'

interface SignupsPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ payment?: string }>
}

export default async function SignupsPage({ params, searchParams }: SignupsPageProps) {
  const { id } = await params
  const { payment } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) redirect('/login')

  const { data: reunion } = await supabase
    .from('reunions')
    .select('id, name')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  const { data: reunionEvents } = await supabase
    .from('sub_events')
    .select('id')
    .eq('reunion_id', id)

  const reunionEventIdSet = new Set(reunionEvents?.map((e) => e.id) ?? [])

  const { data: signups } = await supabase
    .from('signups')
    .select('*, sub_event:sub_event_id(id, name, date, time, location_name, cost_per_person)')
    .eq('member_id', member.id)
    .order('created_at')

  const mySignups = signups?.filter((s) => reunionEventIdSet.has(s.sub_event_id)) ?? []

  const estimatedTotal = mySignups.reduce((sum, s) => {
    const event = (s as any).sub_event
    return event ? sum + event.cost_per_person * s.headcount : sum
  }, 0)

  // Load real balances
  const { data: balances } = await supabase
    .from('balances')
    .select('*')
    .eq('member_id', member.id)
    .eq('reunion_id', id)

  const balanceBySubEvent = new Map(balances?.map((b) => [b.sub_event_id, b]) ?? [])

  const canManage = ['committee', 'admin'].includes(member.role)

  // Committee view: all balances
  let allBalances: any[] = []
  if (canManage) {
    const { data } = await supabase
      .from('balances')
      .select('*, member:member_id(id, name), sub_event:sub_event_id(id, name)')
      .eq('reunion_id', id)
      .order('status')
    allBalances = data ?? []
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/reunion/${id}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {reunion.name}
        </Link>
      </Button>

      <h1 className="mb-6 text-2xl font-bold">My Signups & Balance</h1>

      {payment === 'success' && (
        <div className="mb-6 flex items-center gap-2 rounded-md bg-green-500/10 px-4 py-3 text-green-700">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">Payment received! Your balance will update shortly.</span>
        </div>
      )}
      {payment === 'cancelled' && (
        <div className="mb-6 flex items-center gap-2 rounded-md bg-amber-500/10 px-4 py-3 text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">Payment was cancelled.</span>
        </div>
      )}

      {mySignups.length === 0 ? (
        <Card className="mb-8">
          <CardContent className="py-10 text-center text-muted-foreground">
            <Calendar className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p>You haven't signed up for any events yet.</p>
            <Button asChild className="mt-4" variant="outline" size="sm">
              <Link href={`/reunion/${id}/events`}>Browse events</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mb-8 space-y-4">
          {mySignups.map((signup) => {
            const event = (signup as any).sub_event
            if (!event) return null
            const subtotal = event.cost_per_person * signup.headcount
            const balance = balanceBySubEvent.get(signup.sub_event_id)

            return (
              <Card key={signup.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{event.name}</p>
                        <Badge variant={signup.status === 'confirmed' ? 'default' : 'outline'} className="text-xs">
                          {signup.status}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {formatDate(event.date)}
                        {event.time && ` · ${formatTime(event.time)}`}
                      </p>
                      <p className="mt-1 text-sm">
                        <Users className="mr-1 h-3.5 w-3.5 inline" />
                        {signup.headcount} {signup.headcount === 1 ? 'person' : 'people'}
                        {signup.guest_names && (
                          <span className="text-muted-foreground"> ({signup.guest_names})</span>
                        )}
                      </p>
                    </div>
                    {event.cost_per_person > 0 && (
                      <div className="text-right shrink-0">
                        <p className="font-semibold">{formatCurrency(subtotal)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(event.cost_per_person)} × {signup.headcount}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Balance / payment status */}
                  {balance && event.cost_per_person > 0 && (
                    <div className="mt-3 rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-medium">Payment</span>
                        <BalanceStatusBadge status={balance.status} />
                      </div>
                      <p className="mb-2 text-xs text-muted-foreground">
                        Paid {formatCurrency(balance.amount_paid)} of{' '}
                        {formatCurrency(balance.amount_owed)}
                        {balance.amount_owed - balance.amount_paid > 0 && (
                          <>
                            {' '}
                            &middot;{' '}
                            <span className="font-medium text-foreground">
                              {formatCurrency(balance.amount_owed - balance.amount_paid)} still due
                            </span>
                          </>
                        )}
                      </p>
                      {balance.amount_owed - balance.amount_paid > 0 && (
                        <div className="space-y-2">
                          <PayButton balanceId={balance.id} reunionId={id} />
                          <ManualPayForm
                            balanceId={balance.id}
                            reunionId={id}
                            outstanding={balance.amount_owed - balance.amount_paid}
                          />
                        </div>
                      )}
                      {balance.status === 'pending_confirmation' && (
                        <p className="text-xs text-muted-foreground">
                          A payment you reported is waiting for the committee to confirm it.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-3">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/reunion/${id}/events/${signup.sub_event_id}`}>
                        Manage signup
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {estimatedTotal > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <span className="font-medium">Total Owed</span>
                  </div>
                  <span className="text-xl font-bold text-primary">
                    {formatCurrency(estimatedTotal)}
                  </span>
                </div>
                {balances && balances.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Paid so far: {formatCurrency(balances.reduce((s, b) => s + b.amount_paid, 0))}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Committee: pending confirmations + all balances */}
      {canManage && allBalances.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">All Balances (Committee)</h2>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/reunion/${id}/budget`}>Payments</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/reunion/${id}/report`}>Report</Link>
              </Button>
            </div>
          </div>
          <Card>
            <CardContent className="pt-4">
              <div className="divide-y">
                {allBalances.map((b) => {
                  const m = b.member
                  const evt = b.sub_event
                  return (
                    <div key={b.id} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-medium">{m?.name}</p>
                        <p className="text-xs text-muted-foreground">{evt?.name ?? 'General Fund'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{formatCurrency(b.amount_owed)}</span>
                        <BalanceStatusBadge status={b.status} />
                        {b.status === 'pending_confirmation' && (
                          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                            {/* Confirming is now per payment, not per balance,
                                so it happens where the payments are listed. */}
                            <Link href={`/reunion/${id}/budget`}>Review</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function BalanceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    unpaid: { label: 'Unpaid', className: 'border-red-200 text-red-700 bg-red-50' },
    pending_confirmation: { label: 'Pending', className: 'border-amber-200 text-amber-700 bg-amber-50' },
    partially_paid: { label: 'Partial', className: 'border-blue-200 text-blue-700 bg-blue-50' },
    paid: { label: 'Paid', className: 'border-green-200 text-green-700 bg-green-50' },
  }
  const config = map[status] ?? { label: status, className: '' }
  return (
    <Badge variant="outline" className={`text-xs ${config.className}`}>
      {config.label}
    </Badge>
  )
}
