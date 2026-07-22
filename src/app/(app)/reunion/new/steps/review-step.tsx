'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { computeTotal } from '@/lib/budget-estimator'
import { generateTimeline, type TimelineOptions } from '@/lib/timeline-generator'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { BasicsValue } from './basics-step'
import type { BudgetEstimatorValue } from '@/components/budget-estimator-form'

interface ReviewStepProps {
  basics: BasicsValue
  budget: BudgetEstimatorValue
  timeline: TimelineOptions
  onSubmit: () => void
  onBack: () => void
  isPending: boolean
  error: string | null
}

export function ReviewStep({ basics, budget, timeline, onSubmit, onBack, isPending, error }: ReviewStepProps) {
  const totals = useMemo(
    () => computeTotal(budget.categories, budget.guests, budget.nights, budget.lodgingType),
    [budget]
  )
  const timelineItemCount = useMemo(
    () => (basics.startDate ? generateTimeline(basics.startDate, timeline).length : 0),
    [basics.startDate, timeline]
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Basics</p>
          <p className="font-medium">{basics.name}</p>
          {basics.description && <p className="text-sm text-muted-foreground">{basics.description}</p>}
          <p className="text-sm">
            {formatDate(basics.startDate)}
            {basics.endDate && ` – ${formatDate(basics.endDate)}`}
          </p>
          {basics.hostCity && <p className="text-sm text-muted-foreground">{basics.hostCity}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Budget Estimate</p>
          <p className="text-2xl font-bold">{formatCurrency(totals.total)}</p>
          <p className="text-sm text-muted-foreground">
            {budget.guests.adults + budget.guests.youth + budget.guests.toddlers} guests ·{' '}
            {budget.categories.filter((c) => c.enabled).length} categories
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Timeline</p>
          <p className="font-medium">{timelineItemCount} planning steps generated</p>
          <p className="text-sm text-muted-foreground">
            Editable anytime from the reunion&apos;s Timeline page.
          </p>
        </CardContent>
      </Card>

      <Separator />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="button" onClick={onSubmit} disabled={isPending}>
          {isPending ? 'Creating...' : 'Create Reunion'}
        </Button>
        <Button type="button" variant="outline" onClick={onBack} disabled={isPending}>
          Back
        </Button>
      </div>
    </div>
  )
}
