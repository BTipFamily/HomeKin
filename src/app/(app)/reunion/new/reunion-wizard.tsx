'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createReunionWithPlan } from '@/lib/actions/reunion-wizard'
import { BasicsStep, type BasicsValue } from './steps/basics-step'
import { ReviewStep } from './steps/review-step'

// Interest comes first, so the wizard stops at creating the reunion. The
// budget estimator and the timeline builder both count from a start date and
// cannot say anything before one exists — they now live on the reunion itself,
// reachable once the planning dashboard has settled a date.
type Step = 'basics' | 'review'

const STEP_ORDER: Step[] = ['basics', 'review']
const STEP_LABELS: Record<Step, string> = {
  basics: 'Basics',
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
    year: new Date().getFullYear() + 1,
    hostCity: '',
  })
  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      try {
        const reunionId = await createReunionWithPlan({
          basics: {
            name: basics.name.trim(),
            description: basics.description.trim(),
            year: basics.year,
            hostCity: basics.hostCity.trim(),
          },
        })
        // Straight to the interest page: the next thing to do is ask the
        // family when they can come, not admire an empty reunion.
        router.push(`/reunion/${reunionId}/interest`)
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
            onNext={() => setStep('review')}
            onCancel={() => router.push('/dashboard')}
          />
        )}
        {step === 'review' && (
          <ReviewStep
            basics={basics}
            onSubmit={handleSubmit}
            onBack={() => setStep('basics')}
            isPending={isPending}
            error={error}
          />
        )}
      </CardContent>
    </Card>
  )
}
