'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { HOST_CITIES } from '@/lib/budget-estimator'

export type BasicsValue = {
  name: string
  description: string
  year: number
  hostCity: string
}

interface BasicsStepProps {
  value: BasicsValue
  onChange: (value: BasicsValue) => void
  onNext: () => void
  onCancel: () => void
}

export function BasicsStep({ value, onChange, onNext, onCancel }: BasicsStepProps) {
  // No date check: the reunion is created before anyone has been asked when
  // they can come. The date is settled on the planning dashboard once the
  // interest answers are in.
  const canContinue = value.name.trim().length > 0 && value.year > 0

  function patch(partial: Partial<BasicsValue>) {
    onChange({ ...value, ...partial })
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

      <div className="space-y-2">
        <Label htmlFor="year">Year *</Label>
        <Input
          id="year"
          type="number"
          min={new Date().getFullYear()}
          max={new Date().getFullYear() + 10}
          value={value.year}
          onChange={(e) => patch({ year: Number(e.target.value) || value.year })}
          className="w-full sm:w-40"
        />
        <p className="text-xs text-muted-foreground">
          The exact dates come later, once the family has said when they can travel.
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" onClick={onNext} disabled={!canContinue}>
          Create and gather interest
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
