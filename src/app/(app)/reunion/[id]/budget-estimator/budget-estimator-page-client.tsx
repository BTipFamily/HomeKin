'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Printer, Save } from 'lucide-react'
import { BudgetEstimatorForm, type BudgetEstimatorValue } from '@/components/budget-estimator-form'
import { saveBudgetEstimate } from '@/lib/actions/budget-estimates'
import { computeCategorySubtotal, computeTotal } from '@/lib/budget-estimator'
import { formatCurrency } from '@/lib/utils'

interface BudgetEstimatorPageClientProps {
  reunionId: string
  reunionName: string
  initialValue: BudgetEstimatorValue
  canEdit: boolean
}

export function BudgetEstimatorPageClient({
  reunionId,
  reunionName,
  initialValue,
  canEdit,
}: BudgetEstimatorPageClientProps) {
  const [value, setValue] = useState(initialValue)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const totals = useMemo(
    () => computeTotal(value.categories, value.guests, value.nights, value.lodgingType),
    [value]
  )

  function handleSave() {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      try {
        await saveBudgetEstimate(reunionId, {
          hostCity: value.hostCity,
          nights: value.nights,
          budgetStyle: value.budgetStyle,
          guests: value.guests,
          lodgingType: value.lodgingType,
          categories: value.categories,
        })
        setMessage('Budget estimate saved.')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save budget estimate.')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Printable summary — only shown in the print stylesheet when editing controls are available,
          shown on-screen directly for members who can't edit. */}
      <div className={canEdit ? 'hidden print:block' : ''}>
        <h1 className="mb-4 text-2xl font-bold">{reunionName} — Budget Estimate</h1>
        <PrintSummary value={value} total={totals.total} perPerson={totals.perPerson} />
      </div>

      {canEdit && (
        <div className="print:hidden space-y-6">
          <BudgetEstimatorForm value={value} onChange={setValue} />

          {message && <p className="text-sm text-success">{message}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <Button type="button" onClick={handleSave} disabled={isPending}>
              <Save className="mr-1.5 h-4 w-4" />
              {isPending ? 'Saving...' : 'Save Estimate'}
            </Button>
            <Button type="button" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" />
              Download Estimate
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Click Download Estimate to print or save this summary as a PDF for your committee,
            family, or vendor planning.
          </p>
        </div>
      )}
    </div>
  )
}

function PrintSummary({
  value,
  total,
  perPerson,
}: {
  value: BudgetEstimatorValue
  total: number
  perPerson: number
}) {
  const totalGuests = value.guests.adults + value.guests.youth + value.guests.toddlers
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          {value.hostCity || 'Host city not set'} · {value.nights} night{value.nights === 1 ? '' : 's'} ·{' '}
          {totalGuests} guests
        </p>
        <div className="divide-y">
          {value.categories
            .filter((c) => c.enabled)
            .map((c) => (
              <div key={c.key} className="flex items-center justify-between py-2 text-sm">
                <span>{c.label}</span>
                <span className="font-medium">
                  {formatCurrency(computeCategorySubtotal(c, value.guests, value.nights, value.lodgingType))}
                </span>
              </div>
            ))}
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="font-semibold">Estimated Total</span>
          <span className="text-xl font-bold">{formatCurrency(total)}</span>
        </div>
        {totalGuests > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Per Person</span>
            <span>{formatCurrency(perPerson)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
