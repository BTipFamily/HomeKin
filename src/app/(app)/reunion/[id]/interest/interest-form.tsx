'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Check } from 'lucide-react'
import { saveInterest, type InterestDraft } from '@/lib/actions/interest'
import {
  BUDGET_BAND_LABELS,
  LENGTH_LABELS,
  LODGING_LABELS,
  MONTH_NAMES,
  type Attending,
  type BudgetBand,
  type LodgingNeed,
  type PreferredLength,
} from '@/lib/interest-summary'

const VOLUNTEER_AREAS = [
  'Setup and cleanup',
  'Food',
  'Registration table',
  'Games and activities',
  'Youth',
  'Elder support',
  'Photography',
  'Family history',
  'Transportation',
]

const ATTENDING_OPTIONS: { value: Attending; label: string; hint: string }[] = [
  { value: 'yes', label: 'Yes', hint: "We're in" },
  { value: 'probably', label: 'Probably', hint: 'Likely, not certain' },
  { value: 'unsure', label: 'Not sure', hint: 'Depends on when and where' },
  { value: 'no', label: 'No', hint: "Can't make it" },
]

export function InterestForm({
  reunionId,
  initial,
}: {
  reunionId: string
  initial: InterestDraft | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [draft, setDraft] = useState<InterestDraft>(
    initial ?? {
      attending: 'probably',
      adults: 2,
      youth: 0,
      children: 0,
      preferred_months: [],
      preferred_length: 'weekend',
      budget_band: null,
      lodging_need: null,
      willing_to_volunteer: false,
      volunteer_areas: [],
      history_interest: false,
      notes: '',
    }
  )

  function patch(partial: Partial<InterestDraft>) {
    setDraft((prev) => ({ ...prev, ...partial }))
    setSaved(false)
  }

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await saveInterest(reunionId, draft)
        setSaved(true)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That did not save.')
      }
    })
  }

  // Someone who has said no is not asked to plan a trip they are not taking.
  const coming = draft.attending !== 'no'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Do you hope to come?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ATTENDING_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => patch({ attending: option.value })}
              aria-pressed={draft.attending === option.value}
              className={`rounded-md border p-3 text-left text-sm transition-colors ${
                draft.attending === option.value
                  ? 'border-primary bg-primary/10'
                  : 'hover:border-primary/40 hover:bg-muted/40'
              }`}
            >
              <span className="block font-medium">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Nothing is booked yet — this just helps the committee size the reunion.
        </p>
      </fieldset>

      {coming && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">How many are you bringing?</legend>
            <div className="grid grid-cols-3 gap-3">
              {(['adults', 'youth', 'children'] as const).map((key) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={key} className="text-xs capitalize">
                    {key === 'youth' ? 'Teens' : key}
                  </Label>
                  <Input
                    id={key}
                    type="number"
                    min={0}
                    value={draft[key]}
                    onChange={(e) => patch({ [key]: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Which months could you travel?</legend>
            <div className="flex flex-wrap gap-1.5">
              {MONTH_NAMES.map((name, i) => {
                const month = i + 1
                const on = draft.preferred_months.includes(month)
                return (
                  <button
                    key={month}
                    type="button"
                    onClick={() => patch({ preferred_months: toggle(draft.preferred_months, month) })}
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      on ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-muted/50'
                    }`}
                  >
                    {name.slice(0, 3)}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">How long should it be?</legend>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(LENGTH_LABELS) as PreferredLength[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => patch({ preferred_length: key })}
                  aria-pressed={draft.preferred_length === key}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    draft.preferred_length === key
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  {LENGTH_LABELS[key]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              What could your household comfortably spend, in total?
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(BUDGET_BAND_LABELS) as BudgetBand[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => patch({ budget_band: key })}
                  aria-pressed={draft.budget_band === key}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    draft.budget_band === key
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  {BUDGET_BAND_LABELS[key]}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Only the committee sees this, and only as a total across everyone.
            </p>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Where would you stay?</legend>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(LODGING_LABELS) as LodgingNeed[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => patch({ lodging_need: key })}
                  aria-pressed={draft.lodging_need === key}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    draft.lodging_need === key
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  {LODGING_LABELS[key]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded"
                checked={draft.willing_to_volunteer}
                onChange={(e) =>
                  patch({
                    willing_to_volunteer: e.target.checked,
                    volunteer_areas: e.target.checked ? draft.volunteer_areas : [],
                  })
                }
              />
              I&rsquo;d be willing to help out
            </label>
            {draft.willing_to_volunteer && (
              <div className="flex flex-wrap gap-1.5 pl-6">
                {VOLUNTEER_AREAS.map((area) => {
                  const on = draft.volunteer_areas.includes(area)
                  return (
                    <button
                      key={area}
                      type="button"
                      onClick={() => patch({ volunteer_areas: toggle(draft.volunteer_areas, area) })}
                      aria-pressed={on}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        on ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-muted/50'
                      }`}
                    >
                      {area}
                    </button>
                  )
                })}
              </div>
            )}
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="rounded"
              checked={draft.history_interest}
              onChange={(e) => patch({ history_interest: e.target.checked })}
            />
            I&rsquo;d like to share family history, photos or stories
          </label>
        </>
      )}

      <div className="space-y-1">
        <Label htmlFor="notes" className="text-sm">
          Anything else the committee should know?
        </Label>
        <Textarea
          id="notes"
          rows={3}
          value={draft.notes ?? ''}
          onChange={(e) => patch({ notes: e.target.value })}
          placeholder="Accessibility needs, dates that definitely don't work, ideas..."
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initial ? 'Update my answer' : 'Send my answer'}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground" aria-live="polite">
            <Check className="h-4 w-4" /> Saved — you can change this any time.
          </span>
        )}
      </div>
    </form>
  )
}
