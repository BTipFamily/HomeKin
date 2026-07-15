'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { reportManualPayment } from '@/lib/actions/balances'

const METHODS = [
  { value: 'zelle', label: 'Zelle' },
  { value: 'cashapp', label: 'Cash App' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Other' },
] as const

type Method = (typeof METHODS)[number]['value']

interface ManualPayFormProps {
  balanceId: string
  reunionId: string
}

export default function ManualPayForm({ balanceId, reunionId }: ManualPayFormProps) {
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<Method>('zelle')
  const [pending, setPending] = useState(false)

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
    await reportManualPayment(balanceId, method, reunionId)
    setPending(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-wrap">
      <select
        value={method}
        onChange={(e) => setMethod(e.target.value as Method)}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        {METHODS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" className="h-8 text-xs" disabled={pending}>
        {pending ? 'Saving...' : 'Report Payment'}
      </Button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-muted-foreground"
      >
        Cancel
      </button>
    </form>
  )
}
