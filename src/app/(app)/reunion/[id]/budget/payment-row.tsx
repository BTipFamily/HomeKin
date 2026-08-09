'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Loader2, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { formatPaymentMethod } from '@/lib/stripe-payment-method'
import { confirmPayment, deletePayment } from '@/lib/actions/balances'
import type { ActionState } from '@/lib/action-state'
import type { Payment } from '@/types/database'

/** One reported payment awaiting a committee decision. */
export default function PaymentRow({
  payment,
  reunionId,
  memberName,
  eventName,
}: {
  payment: Payment
  reunionId: string
  memberName: string
  eventName: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Reads the returned state rather than catching. The catch is still here for
  // a genuine transport failure, but it can no longer be the thing that reports
  // "Stripe payments cannot be deleted" — React strips the message off a
  // rejected Server Action promise in production just as it does off a thrown
  // form action, so that sentence used to arrive as the redacted generic error.
  function run(action: () => Promise<ActionState>) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await action()
        if (result.status === 'error') setError(result.message)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not work.')
      }
    })
  }

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{memberName}</p>
          <p className="text-xs text-muted-foreground">
            {eventName} · {formatPaymentMethod(payment.method, payment.stripe_payment_method)} ·
            reported {payment.paid_at.slice(0, 10)}
            {payment.note ? ` · ${payment.note}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{formatCurrency(Number(payment.amount))}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => run(() => confirmPayment(payment.id, reunionId))}
          >
            {isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-1 h-3.5 w-3.5" />
            )}
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={isPending}
            title="This payment never arrived"
            onClick={() => run(() => deletePayment(payment.id, reunionId))}
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Reject</span>
          </Button>
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
