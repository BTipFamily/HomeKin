'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { generateTimeline, type TimelineOptions } from '@/lib/timeline-generator'
import { formatDate } from '@/lib/utils'

interface TimelineStepProps {
  startDate: string
  options: TimelineOptions
  onChange: (options: TimelineOptions) => void
  onNext: () => void
  onBack: () => void
}

const OPTION_FIELDS: {
  key: keyof TimelineOptions
  label: string
  hint: string
}[] = [
  { key: 'multiDay', label: 'Multi-day reunion', hint: 'adds itinerary + activity planning steps' },
  { key: 'lodging', label: 'Hotel block / lodging coordination', hint: 'adds group rate steps' },
  { key: 'merchandise', label: 'Reunion shirts / merchandise', hint: 'adds vendor + sizing deadlines' },
  {
    key: 'heritage',
    label: 'Heritage / genealogy activity',
    hint: 'adds memory table, family tree, slideshow steps',
  },
]

export function TimelineStep({ startDate, options, onChange, onNext, onBack }: TimelineStepProps) {
  const items = useMemo(() => generateTimeline(startDate, options), [startDate, options])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof items>()
    for (const item of items) {
      const key = item.phase_label
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return Array.from(map.entries())
  }, [items])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 font-semibold">1) Your Reunion Date</h3>
        <p className="text-sm text-muted-foreground">
          {startDate ? formatDate(startDate) : 'Set a start date on the Basics step first.'}
        </p>
      </div>

      <div>
        <h3 className="mb-3 font-semibold">2) Reunion Options</h3>
        <div className="space-y-2">
          {OPTION_FIELDS.map((field) => (
            <label key={field.key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 rounded"
                checked={options[field.key]}
                onChange={(e) => onChange({ ...options, [field.key]: e.target.checked })}
              />
              <span>
                <strong>{field.label}</strong>{' '}
                <span className="text-muted-foreground">({field.hint})</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Built-In Convenience</p>
          <p className="mt-1">
            Your timeline includes suggested deadlines for RSVPs, payments, vendors, and final
            confirmations — based on your reunion date. Everyone on the committee will see the same
            shared checklist once the reunion is created.
          </p>
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-semibold">Preview ({items.length} steps)</h3>
        <div className="space-y-3">
          {grouped.map(([phase, phaseItems]) => (
            <Card key={phase}>
              <CardContent className="pt-4">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{phase}</p>
                <ul className="space-y-1 text-sm">
                  {phaseItems.map((item) => (
                    <li key={item.title} className="flex items-center justify-between gap-3">
                      <span>{item.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(item.due_date)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" onClick={onNext}>
          Continue to Review
        </Button>
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  )
}
