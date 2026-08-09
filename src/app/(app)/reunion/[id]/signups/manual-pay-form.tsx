'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { reportManualPayment } from '@/lib/actions/balances'
import type { PaymentMethod } from '@/types/database'

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'zelle', label: 'Zelle' },
  { value: 'cashapp', label: 'Cash App' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
]

interface ManualPayFormProps {
  balanceId: string
  reunionId: string
  /** Pre-fills the amount, which is what most people are paying. */
  outstanding: number
}

export default function ManualPayForm({
  balanceId,
  reunionId,
  outstanding,
}: ManualPayFormProps) {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('zelle')
  const [amount, setAmount] = useState(outstanding.toFixed(2))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <p className="text-xs text-muted-foreground">
        Reported — the committee will confirm it.
      </p>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground underline underline-offset-2"
      >
        I already paid another way
      </button>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      // The amount is reported, not assumed: part payments are normal and the
      // old form recorded no figure at all.
      const result = await reportManualPayment(balanceId, method, Number(amount), reunionId)
      if (result.status === 'error') {
        // Comes back as a value now. Thrown, the overpayment message —
        // "That is more than the $40.00 outstanding" — reached the member as
        // Next's redacted placeholder, which told them nothing about what to
        // type instead.
        setError(result.message)
      } else {
        setDone(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not report that payment.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            $
          </span>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            max={outstanding}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-8 w-24 pl-5 text-xs"
            required
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={pending}
        >
          {pending ? 'Saving...' : 'Report Payment'}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  )
}
