'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Check, Plus, X } from 'lucide-react'
import { saveInterest, type InterestDraft } from '@/lib/actions/interest'
import { HOST_CITIES } from '@/lib/budget-estimator'
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

const FOOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'catered', label: 'Catered' },
  { value: 'potluck', label: 'Potluck' },
  { value: 'cookout', label: 'Cookout / BBQ' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'mixed', label: 'A mix' },
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
      date_ranges: [],
      suggested_locations: [],
      food_preferences: [],
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
            <legend className="text-sm font-medium">Which exact dates could you travel?</legend>
            <p className="text-xs text-muted-foreground">
              Give any windows that work — &ldquo;the 12th to the 19th&rdquo;, or a single day.
              The committee looks for the window the most families share, so a range is far
              more use than one date.
            </p>
            {draft.date_ranges.map((range, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input
                    type="date"
                    value={range.starts_on}
                    onChange={(e) =>
                      patch({
                        date_ranges: draft.date_ranges.map((r, index) =>
                          index === i
                            ? {
                                starts_on: e.target.value,
                                // Keep the pair coherent: a start after the end
                                // would only be refused on save.
                                ends_on: r.ends_on && r.ends_on < e.target.value ? e.target.value : r.ends_on,
                              }
                            : r
                        ),
                      })
                    }
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input
                    type="date"
                    value={range.ends_on}
                    min={range.starts_on || undefined}
                    onChange={(e) =>
                      patch({
                        date_ranges: draft.date_ranges.map((r, index) =>
                          index === i ? { ...r, ends_on: e.target.value } : r
                        ),
                      })
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="mb-0.5 h-9 w-9 shrink-0"
                  onClick={() =>
                    patch({ date_ranges: draft.date_ranges.filter((_, index) => index !== i) })
                  }
                  aria-label="Remove this window"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                patch({ date_ranges: [...draft.date_ranges, { starts_on: '', ends_on: '' }] })
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add a window
            </Button>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Where would you like it?</legend>
            <p className="text-xs text-muted-foreground">
              Anywhere you would happily travel to. The committee shortlists the most popular
              suggestions for a vote.
            </p>
            {draft.suggested_locations.map((place, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  list="interest-city-options"
                  value={place}
                  onChange={(e) =>
                    patch({
                      suggested_locations: draft.suggested_locations.map((p, index) =>
                        index === i ? e.target.value : p
                      ),
                    })
                  }
                  placeholder="Atlanta, GA"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  onClick={() =>
                    patch({
                      suggested_locations: draft.suggested_locations.filter((_, index) => index !== i),
                    })
                  }
                  aria-label="Remove this suggestion"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <datalist id="interest-city-options">
              {HOST_CITIES.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => patch({ suggested_locations: [...draft.suggested_locations, ''] })}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Suggest a place
            </Button>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">How should we eat?</legend>
            <div className="flex flex-wrap gap-1.5">
              {FOOD_OPTIONS.map((option) => {
                const on = draft.food_preferences.includes(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      patch({ food_preferences: toggle(draft.food_preferences, option.value) })
                    }
                    aria-pressed={on}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      on ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-muted/50'
                    }`}
                  >
                    {option.label}
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
