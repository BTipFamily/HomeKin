'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import type { BasicsValue } from './basics-step'

interface ReviewStepProps {
  basics: BasicsValue
  onSubmit: () => void
  onBack: () => void
  isPending: boolean
  error: string | null
}

/**
 * The last screen before the reunion exists.
 *
 * Short on purpose. There is little to review, because the point of creating a
 * reunion now is to have somewhere for the family to answer — the date, the
 * place and the budget are all decisions this step deliberately does not
 * pretend to have made. It used to show a budget estimate and a generated
 * timeline, both of which were computed from a start date the organiser had
 * guessed before asking anybody.
 */
export function ReviewStep({ basics, onSubmit, onBack, isPending, error }: ReviewStepProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-2 pt-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Basics</p>
          <p className="font-medium">{basics.name}</p>
          {basics.description && (
            <p className="text-sm text-muted-foreground">{basics.description}</p>
          )}
          <p className="text-sm">{basics.year}</p>
          {basics.hostCity && <p className="text-sm text-muted-foreground">{basics.hostCity}</p>}
        </CardContent>
      </Card>

      <div className="rounded-md border border-dashed p-4">
        <p className="text-sm font-medium">What happens next</p>
        <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li>1. The family says whether they hope to come, when they can travel, and where.</li>
          <li>2. You read the answers on the planning dashboard and settle a date and a place.</li>
          <li>3. The budget estimator, the timeline and the events open up from there.</li>
        </ol>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button onClick={onSubmit} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create and start gathering interest
        </Button>
        <Button variant="outline" onClick={onBack} disabled={isPending}>
          Back
        </Button>
      </div>
    </div>
  )
}
