import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, TrendingUp, AlertCircle, Clock, FileText } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { formatPaymentMethod } from '@/lib/stripe-payment-method'
import { BalanceBadge } from '@/components/member-history-view'
import type { Payment } from '@/types/database'
import PaymentRow from './payment-row'

interface BudgetPageProps {
  params: Promise<{ id: string }>
}

/** Worst first — the order a treasurer actually works through. */
const STATUS_ORDER: Record<string, number> = {
  unpaid: 0,
  partially_paid: 1,
  pending_confirmation: 2,
  paid: 3,
}

export default async function PaymentsPage({ params }: BudgetPageProps) {
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

  const { data: balanceRows } = await supabase
    .from('balances')
    .select('*, member:member_id(id, name, email), sub_event:sub_event_id(id, name)')
    .eq('reunion_id', id)

  const { data: paymentRows } = await supabase
    .from('payments')
    .select('*')
    .eq('reunion_id', id)
    .order('paid_at', { ascending: false })

  type BalanceRow = {
    id: string
    amount_owed: number
    amount_paid: number
    status: string
    member: { id: string; name: string; email: string } | null
    sub_event: { id: string; name: string } | null
  }

  const balances = (balanceRows ?? []) as unknown as BalanceRow[]
  const payments = (paymentRows ?? []) as unknown as Payment[]

  const paymentsByBalance = new Map<string, Payment[]>()
  for (const payment of payments) {
    const list = paymentsByBalance.get(payment.balance_id) ?? []
    list.push(payment)
    paymentsByBalance.set(payment.balance_id, list)
  }

  const confirmed = payments.filter((p) => p.status === 'confirmed')
  const pending = payments.filter((p) => p.status === 'pending')

  const totalOwed = balances.reduce((s, b) => s + Number(b.amount_owed), 0)
  const totalPaid = confirmed.reduce((s, p) => s + Number(p.amount), 0)
  const stripePaid = confirmed
    .filter((p) => p.method === 'stripe')
    .reduce((s, p) => s + Number(p.amount), 0)
  const manualPaid = totalPaid - stripePaid
  const outstanding = balances.reduce(
    (s, b) => s + Math.max(Number(b.amount_owed) - Number(b.amount_paid), 0),
    0
  )

  // Worst-off first, then largest debt, so the top of the list is the work.
  const sorted = [...balances].sort(
    (a, b) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
      Number(b.amount_owed) - Number(b.amount_paid) - (Number(a.amount_owed) - Number(a.amount_paid)) ||
      (a.member?.name ?? '').localeCompare(b.member?.name ?? '')
  )

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/reunion/${id}`}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {reunion.name}
        </Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          {/* "Payments", not "Budget" — the Budget Estimator is a different,
              unrelated planning tool and sharing the word confused both. */}
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-sm text-muted-foreground">
            What everyone owes and what has actually come in.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/reunion/${id}/report`}>
            <FileText className="mr-1.5 h-4 w-4" />
            Full Report
          </Link>
        </Button>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Collected</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Stripe {formatCurrency(stripePaid)} · Manual {formatCurrency(manualPaid)}
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
                <p className="mt-1 text-xs text-muted-foreground">
                  of {formatCurrency(totalOwed)} expected
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-amber-500 opacity-60" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Awaiting Confirmation</p>
                <p className="text-2xl font-bold">{pending.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatCurrency(pending.reduce((s, p) => s + Number(p.amount), 0))} reported
                </p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground opacity-40" />
            </div>
          </CardContent>
        </Card>
      </div>

      {pending.length > 0 && (
        <Card className="mb-8 border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-amber-500" />
              Reported payments to confirm
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {pending.map((payment) => {
              const balance = balances.find((b) => b.id === payment.balance_id)
              return (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  reunionId={id}
                  memberName={balance?.member?.name ?? 'Unknown member'}
                  eventName={balance?.sub_event?.name ?? 'General Fund'}
                />
              )
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            All balances{' '}
            <span className="font-normal text-muted-foreground">({balances.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {balances.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nobody has been charged for anything yet.
            </p>
          ) : (
            <div className="divide-y">
              {/* Settled balances stay listed rather than being filtered out —
                  hiding them made paid history invisible. */}
              {sorted.map((balance) => {
                const balancePayments = paymentsByBalance.get(balance.id) ?? []
                const due = Number(balance.amount_owed) - Number(balance.amount_paid)
                return (
                  <div key={balance.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/directory/${balance.member?.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {balance.member?.name ?? 'Unknown member'}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {balance.sub_event?.name ?? 'General Fund'}
                          {balance.member?.email ? ` · ${balance.member.email}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">
                          <span className="font-medium text-green-600">
                            {formatCurrency(Number(balance.amount_paid))}
                          </span>
                          <span className="text-muted-foreground">
                            {' '}
                            of {formatCurrency(Number(balance.amount_owed))}
                          </span>
                        </p>
                        <div className="mt-0.5 flex items-center justify-end gap-2">
                          {due > 0 && (
                            <span className="text-xs font-medium text-amber-600">
                              {formatCurrency(due)} due
                            </span>
                          )}
                          <BalanceBadge status={balance.status} />
                        </div>
                      </div>
                    </div>

                    {balancePayments.length > 0 && (
                      <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-muted-foreground">
                        {balancePayments.map((payment) => (
                          <li key={payment.id} className="flex items-center justify-between gap-2">
                            <span>
                              {payment.paid_at.slice(0, 10)} ·{' '}
                              {formatPaymentMethod(payment.method, payment.stripe_payment_method)}
                              {payment.status === 'pending' ? ' · awaiting confirmation' : ''}
                              {payment.note ? ` · ${payment.note}` : ''}
                            </span>
                            <span className={payment.amount < 0 ? 'text-destructive' : ''}>
                              {payment.amount < 0 ? '−' : ''}
                              {formatCurrency(Math.abs(Number(payment.amount)))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
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
