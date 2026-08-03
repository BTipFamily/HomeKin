'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { HOST_CITIES } from '@/lib/budget-estimator'
import { suggestEndDate, validateReunionDates } from '@/lib/reunion-dates'

export type BasicsValue = {
  name: string
  description: string
  startDate: string
  endDate: string | null
  multiDay: boolean
  hostCity: string
}

interface BasicsStepProps {
  value: BasicsValue
  onChange: (value: BasicsValue) => void
  onNext: () => void
  onCancel: () => void
}

export function BasicsStep({ value, onChange, onNext, onCancel }: BasicsStepProps) {
  const dateError = validateReunionDates(value)
  const canContinue = value.name.trim().length > 0 && dateError === null

  function patch(partial: Partial<BasicsValue>) {
    onChange({ ...value, ...partial })
  }

  /**
   * Picking a start date fills in an end date to match, so the multi-day
   * default arrives complete rather than as an empty field the organiser has
   * to notice. Only ever fills a blank one — a date already chosen is theirs.
   */
  function patchStartDate(startDate: string) {
    const endDate =
      value.multiDay && !value.endDate ? suggestEndDate(startDate) : value.endDate
    patch({ startDate, endDate })
  }

  /** The checkbox reads as "single day", the data stays `multiDay`. */
  function patchSingleDay(singleDay: boolean) {
    if (singleDay) {
      patch({ multiDay: false, endDate: null })
    } else {
      patch({ multiDay: true, endDate: value.endDate ?? suggestEndDate(value.startDate) })
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Reunion Name *</Label>
        <Input
          id="name"
          required
          value={value.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Smith Family Reunion 2027"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={4}
          value={value.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="Tell the family what this reunion is about..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="host-city">Host City</Label>
        <Input
          id="host-city"
          list="basics-host-city-options"
          value={value.hostCity}
          onChange={(e) => patch({ hostCity: e.target.value })}
          placeholder="Atlanta, GA"
        />
        <datalist id="basics-host-city-options">
          {HOST_CITIES.map((city) => (
            <option key={city} value={city} />
          ))}
        </datalist>
        <p className="text-xs text-muted-foreground">
          Used to look up cost averages in the Budget Estimator and to show this reunion on the map.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="start-date">Start Date *</Label>
          <Input
            id="start-date"
            type="date"
            required
            value={value.startDate}
            onChange={(e) => patchStartDate(e.target.value)}
          />
        </div>
        {value.multiDay && (
          <div className="space-y-2">
            <Label htmlFor="end-date">End Date *</Label>
            <Input
              id="end-date"
              type="date"
              required
              value={value.endDate ?? ''}
              min={value.startDate || undefined}
              onChange={(e) => patch({ endDate: e.target.value || null })}
            />
          </div>
        )}
      </div>

      {dateError && value.startDate && (
        <p className="text-xs text-destructive" role="alert">
          {dateError}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="rounded"
          checked={!value.multiDay}
          onChange={(e) => patchSingleDay(e.target.checked)}
        />
        This reunion is only one day
      </label>

      <div className="flex gap-3 pt-2">
        <Button type="button" onClick={onNext} disabled={!canContinue}>
          Continue to Budget Estimator
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
