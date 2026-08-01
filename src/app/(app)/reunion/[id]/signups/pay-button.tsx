'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CreditCard, Loader2 } from 'lucide-react'

interface PayButtonProps {
  balanceId: string
  reunionId: string
}

export default function PayButton({ balanceId, reunionId }: PayButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePay() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/checkout/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balanceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start checkout')
      window.location.href = data.url
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div>
      <Button onClick={handlePay} disabled={loading} size="sm" className="w-full sm:w-auto">
        {loading ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <CreditCard className="mr-2 h-3.5 w-3.5" />
        )}
        Pay Online
      </Button>
      {/*
        Not "Pay with Apple Pay": the wallet buttons are offered by Stripe on
        the checkout page, and only where the device supports them — Apple Pay
        on Safari with a card in Wallet, Google Pay in Chrome. Naming one on the
        button would promise most visitors something they will not be shown.
      */}
      <p className="mt-1 text-xs text-muted-foreground">
        Card, Apple Pay, Google Pay or Cash App Pay.
      </p>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
