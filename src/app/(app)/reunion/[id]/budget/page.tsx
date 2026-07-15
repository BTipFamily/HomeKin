import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, TrendingUp, DollarSign, Users, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { confirmManualPayment } from '@/lib/actions/balances'

interface BudgetPageProps {
  params: Promise<{ id: string }>
}

export default async function BudgetPage({ params }: BudgetPageProps) {
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
  if (!member || !['committee', 'admin'].includes(member.role)) redirect(`/reunion/${id}`)

  const { data: reunion } = await supabase
    .from('reunions')
    .select('id, name')
    .eq('id', id)
    .single()
  if (!reunion) notFound()

  // All balances for this reunion with member + event details
  const { data: balances } = await supabase
    .from('balances')
    .select('*, member:member_id(id, name, email), sub_event:sub_event_id(id, name, cost_per_person)')
    .eq('reunion_id', id)
    .order('status')

  const allBalances = balances ?? []

  const totalOwed = allBalances.reduce((s, b) => s + b.amount_owed, 0)
  const totalPaid = allBalances.reduce((s, b) => s + b.amount_paid, 0)
  const stripePaid = allBalances
    .filter((b) => b.payment_method === 'stripe')
    .reduce((s, b) => s + b.amount_paid, 0)
  const manualPaid = totalPaid - stripePaid
  const outstanding = allBalances
    .filter((b) => b.status !== 'paid')
    .reduce((s, b) => s + (b.amount_owed - b.amount_paid), 0)
  const pendingConfirmation = allBalances.filter((b) => b.status === 'pending_confirmation')

  // Per-event totals
  const { data: subEvents } = await supabase
    .from('sub_events')
    .select('id, name, cost_per_person, capacity')
    .eq('reunion_id', id)

  const eventBalanceTotals = (subEvents ?? []).map((evt) => {
    const evtBalances = allBalances.filter((b) => b.sub_event_id === evt.id)
    return {
      ...evt,
      totalOwed: evtBalances.reduce((s, b) => s + b.amount_owed, 0),
      totalPaid: evtBalances.reduce((s, b) => s + b.amount_paid, 0),
      unpaidCount: evtBalances.filter((b) => b.status === 'unpaid').length,
    }
  }).filter((e) => e.totalOwed > 0)

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/reunion/${id}/signups`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Signups
        </Link>
      </Button>

      <h1 className="mb-6 text-2xl font-bold">{reunion.name} — Budget</h1>

      {/* Summary stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Collected</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Stripe: {formatCurrency(stripePaid)} · Manual: {formatCurrency(manualPaid)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500 opacity-60" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="text-2xl font-bold text-amber-600">{formatCurrency(outstanding)}</p>
                <p className="text-xs text-muted-foreground mt-1">of {formatCurrency(totalOwed)} total owed</p>
              </div>
              <AlertCircle className="h-8 w-8 text-amber-500 opacity-60" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Confirm</p>
                <p className="text-2xl font-bold">{pendingConfirmation.length}</p>
                <p className="text-xs text-muted-foreground mt-1">manual payments to review</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground opacity-40" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending confirmations */}
      {pendingConfirmation.length > 0 && (
        <Card className="mb-8 border-amber-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Payments Pending Confirmation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {pendingConfirmation.map((b) => {
                const m = (b as any).member
                const evt = (b as any).sub_event
                return (
                  <div key={b.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium">{m?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {evt?.name ?? 'General Fund'} · {b.payment_method} ·{' '}
                        {formatCurrency(b.amount_owed)}
                      </p>
                    </div>
                    <form
                      action={async () => {
                        'use server'
                        await confirmManualPayment(b.id, id)
                      }}
                    >
                      <Button type="submit" size="sm" variant="outline">
                        Confirm Paid
                      </Button>
                    </form>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-event breakdown */}
      {eventBalanceTotals.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Per-Event Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {eventBalanceTotals.map((evt) => (
                <div key={evt.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium">{evt.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {evt.unpaidCount} outstanding
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-green-600">{formatCurrency(evt.totalPaid)} paid</p>
                    <p className="text-xs text-muted-foreground">of {formatCurrency(evt.totalOwed)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All balances by member */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Outstanding Balances</CardTitle>
        </CardHeader>
        <CardContent>
          {allBalances.filter((b) => b.status !== 'paid').length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              All balances are paid.
            </p>
          ) : (
            <div className="divide-y">
              {allBalances
                .filter((b) => b.status !== 'paid')
                .map((b) => {
                  const m = (b as any).member
                  const evt = (b as any).sub_event
                  return (
                    <div key={b.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <div>
                        <p className="font-medium">{m?.name}</p>
                        <p className="text-xs text-muted-foreground">{evt?.name ?? 'General Fund'}</p>
                        {m?.email && <p className="text-xs text-muted-foreground">{m.email}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span>{formatCurrency(b.amount_owed)}</span>
                        <StatusBadge status={b.status} />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
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
