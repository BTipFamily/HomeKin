'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createReunionWithPlan } from '@/lib/actions/reunion-wizard'
import { defaultBudgetEstimatorValue, type BudgetEstimatorValue } from '@/components/budget-estimator-form'
import type { TimelineOptions } from '@/lib/timeline-generator'
import { BasicsStep, type BasicsValue } from './steps/basics-step'
import { BudgetStep } from './steps/budget-step'
import { TimelineStep } from './steps/timeline-step'
import { ReviewStep } from './steps/review-step'

type Step = 'basics' | 'budget' | 'timeline' | 'review'

const STEP_ORDER: Step[] = ['basics', 'budget', 'timeline', 'review']
const STEP_LABELS: Record<Step, string> = {
  basics: 'Basics',
  budget: 'Budget Estimator',
  timeline: 'Timeline Builder',
  review: 'Review',
}

export default function ReunionWizard() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<Step>('basics')
  const [error, setError] = useState<string | null>(null)

  // Multi-day by default: most family reunions run a weekend, so the wizard
  // assumes that and offers a way out rather than making everyone opt in. The
  // end date fills itself in once a start date is picked.
  const [basics, setBasics] = useState<BasicsValue>({
    name: '',
    description: '',
    startDate: '',
    endDate: null,
    multiDay: true,
    hostCity: '',
  })
  const [budget, setBudget] = useState<BudgetEstimatorValue>(defaultBudgetEstimatorValue())
  const [timeline, setTimeline] = useState<TimelineOptions>({
    multiDay: true,
    lodging: true,
    merchandise: true,
    heritage: false,
  })
  // Tracks whether we've auto-suggested timeline options from the budget step yet,
  // so we don't clobber the user's manual edits if they go back and forth.
  const [timelineSuggested, setTimelineSuggested] = useState(false)

  function goToTimeline() {
    if (!timelineSuggested) {
      setTimeline({
        multiDay: basics.multiDay,
        lodging: budget.categories.find((c) => c.key === 'lodging')?.enabled ?? true,
        merchandise: budget.categories.find((c) => c.key === 'merchandise')?.enabled ?? true,
        heritage: budget.categories.find((c) => c.key === 'heritage')?.enabled ?? false,
      })
      setTimelineSuggested(true)
    }
    setStep('timeline')
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      try {
        const reunionId = await createReunionWithPlan({
          basics: {
            name: basics.name.trim(),
            description: basics.description.trim(),
            startDate: basics.startDate,
            endDate: basics.multiDay ? basics.endDate : null,
            hostCity: basics.hostCity.trim(),
          },
          budget: {
            nights: budget.nights,
            budgetStyle: budget.budgetStyle,
            guests: budget.guests,
            lodgingType: budget.lodgingType,
            categories: budget.categories,
          },
          timeline,
        })
        router.push(`/reunion/${reunionId}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong creating the reunion.')
      }
    })
  }

  const currentIndex = STEP_ORDER.indexOf(step)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a Reunion</CardTitle>
        <CardDescription>
          Step {currentIndex + 1} of {STEP_ORDER.length}: {STEP_LABELS[step]}
        </CardDescription>
        <div className="flex gap-1.5 pt-2">
          {STEP_ORDER.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${i <= currentIndex ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {step === 'basics' && (
          <BasicsStep
            value={basics}
            onChange={setBasics}
            onNext={() => setStep('budget')}
            onCancel={() => router.push('/dashboard')}
          />
        )}
        {step === 'budget' && (
          <BudgetStep
            value={budget}
            onChange={setBudget}
            onNext={goToTimeline}
            onBack={() => setStep('basics')}
          />
        )}
        {step === 'timeline' && (
          <TimelineStep
            startDate={basics.startDate}
            options={timeline}
            onChange={setTimeline}
            onNext={() => setStep('review')}
            onBack={() => setStep('budget')}
          />
        )}
        {step === 'review' && (
          <ReviewStep
            basics={basics}
            budget={budget}
            timeline={timeline}
            onSubmit={handleSubmit}
            onBack={() => setStep('timeline')}
            isPending={isPending}
            error={error}
          />
        )}
      </CardContent>
    </Card>
  )
}
