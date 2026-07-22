'use client'

import { Button } from '@/components/ui/button'
import { BudgetEstimatorForm, type BudgetEstimatorValue } from '@/components/budget-estimator-form'

interface BudgetStepProps {
  value: BudgetEstimatorValue
  onChange: (value: BudgetEstimatorValue) => void
  onNext: () => void
  onBack: () => void
}

export function BudgetStep({ value, onChange, onNext, onBack }: BudgetStepProps) {
  return (
    <div className="space-y-6">
      <BudgetEstimatorForm value={value} onChange={onChange} />

      <div className="flex gap-3 pt-2">
        <Button type="button" onClick={onNext}>
          Continue to Timeline Builder
        </Button>
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  )
}
