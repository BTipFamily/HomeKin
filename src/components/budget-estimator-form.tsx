'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  buildDefaultCategories,
  CATEGORY_DESCRIPTIONS,
  computeTotal,
  HOST_CITIES,
  type GuestCounts,
} from '@/lib/budget-estimator'
import { formatCurrency } from '@/lib/utils'
import type { BudgetCategory, BudgetStyle, LodgingType } from '@/types/database'

export type BudgetEstimatorValue = {
  hostCity: string
  nights: number
  budgetStyle: BudgetStyle
  guests: GuestCounts
  lodgingType: LodgingType
  categories: BudgetCategory[]
}

interface BudgetEstimatorFormProps {
  value: BudgetEstimatorValue
  onChange: (value: BudgetEstimatorValue) => void
}

export function BudgetEstimatorForm({ value, onChange }: BudgetEstimatorFormProps) {
  const { hostCity, nights, budgetStyle, guests, lodgingType, categories } = value

  const totals = useMemo(
    () => computeTotal(categories, guests, nights, lodgingType),
    [categories, guests, nights, lodgingType]
  )
  const totalGuestCount = guests.adults + guests.youth + guests.toddlers

  function patch(partial: Partial<BudgetEstimatorValue>) {
    onChange({ ...value, ...partial })
  }

  // City/style changes re-prefill suggested amounts for every category —
  // matches "Use Low/Average/High to pre-fill... then customize per your family."
  function handleHostCityChange(city: string) {
    const refreshed = buildDefaultCategories(city, budgetStyle)
    const merged = categories.map((c, i) => ({ ...refreshed[i], enabled: c.enabled }))
    patch({ hostCity: city, categories: merged })
  }

  function handleBudgetStyleChange(style: BudgetStyle) {
    const refreshed = buildDefaultCategories(hostCity, style)
    const merged = categories.map((c, i) => ({ ...refreshed[i], enabled: c.enabled }))
    patch({ budgetStyle: style, categories: merged })
  }

  function updateCategory(key: string, partial: Partial<BudgetCategory>) {
    patch({
      categories: categories.map((c) => (c.key === key ? { ...c, ...partial } : c)),
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 font-semibold">1) Reunion Basics</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="host-city">Host City</Label>
            <Input
              id="host-city"
              list="host-city-options"
              value={hostCity}
              onChange={(e) => handleHostCityChange(e.target.value)}
              placeholder="Atlanta, GA"
            />
            <datalist id="host-city-options">
              {HOST_CITIES.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="nights">Nights</Label>
              <Input
                id="nights"
                type="number"
                min={1}
                value={nights}
                onChange={(e) => patch({ nights: Math.max(1, parseInt(e.target.value) || 1) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Budget Style</Label>
              <Select value={budgetStyle} onValueChange={(v) => handleBudgetStyleChange(v as BudgetStyle)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low (budget-friendly)</SelectItem>
                  <SelectItem value="average">Average (balanced)</SelectItem>
                  <SelectItem value="high">High (upscale)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="adults">Adults 13+</Label>
              <Input
                id="adults"
                type="number"
                min={0}
                value={guests.adults}
                onChange={(e) =>
                  patch({ guests: { ...guests, adults: Math.max(0, parseInt(e.target.value) || 0) } })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="youth">Youth 6-12</Label>
              <Input
                id="youth"
                type="number"
                min={0}
                value={guests.youth}
                onChange={(e) =>
                  patch({ guests: { ...guests, youth: Math.max(0, parseInt(e.target.value) || 0) } })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="toddlers">Toddlers 0-5</Label>
              <Input
                id="toddlers"
                type="number"
                min={0}
                value={guests.toddlers}
                onChange={(e) =>
                  patch({ guests: { ...guests, toddlers: Math.max(0, parseInt(e.target.value) || 0) } })
                }
              />
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Quick Tip</p>
            <p className="mt-1">
              Use <strong>Low / Average / High</strong> to pre-fill suggested costs — then customize
              per your family.
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-semibold">2) Include Planning Categories</h3>
        <div className="space-y-3">
          {categories.map((category) => (
            <Card key={category.key}>
              <CardContent className="pt-4 space-y-2">
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={category.enabled}
                    onChange={(e) => updateCategory(category.key, { enabled: e.target.checked })}
                  />
                  {category.label}
                </label>
                <p className="text-xs text-muted-foreground">
                  {CATEGORY_DESCRIPTIONS[category.key]}
                </p>
                <Input
                  type="number"
                  min={0}
                  value={category.unit_amount}
                  disabled={!category.enabled}
                  onChange={(e) =>
                    updateCategory(category.key, { unit_amount: Math.max(0, parseFloat(e.target.value) || 0) })
                  }
                />
                {category.key === 'lodging' && (
                  <Select
                    value={lodgingType}
                    onValueChange={(v) => patch({ lodgingType: v as LodgingType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hotel_resort">Hotel / Resort (assume 4 guests per room)</SelectItem>
                      <SelectItem value="vacation_rental">Vacation Rental (assume 6 guests per unit)</SelectItem>
                      <SelectItem value="mixed">Mixed lodging</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Estimated Total</p>
            <p className="text-2xl font-bold">{formatCurrency(totals.total)}</p>
          </div>
          {totalGuestCount > 0 && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Per Person</p>
              <p className="text-lg font-semibold">{formatCurrency(totals.perPerson)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function defaultBudgetEstimatorValue(hostCity = '', budgetStyle: BudgetStyle = 'average'): BudgetEstimatorValue {
  return {
    hostCity,
    nights: 1,
    budgetStyle,
    guests: { adults: 0, youth: 0, toddlers: 0 },
    lodgingType: 'hotel_resort',
    categories: buildDefaultCategories(hostCity, budgetStyle),
  }
}
