'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Plus, X } from 'lucide-react'
import type { BookingMode, PriceTier } from '@/lib/event-pricing'

type TierRow = { min_headcount: string; price_per_person: string }

const MODES: { value: BookingMode; label: string; hint: string }[] = [
  {
    value: 'homekin',
    label: 'We collect the money',
    hint: 'Members are billed here and pay through HomeKin.',
  },
  {
    value: 'direct',
    label: 'They book with the vendor',
    hint: 'Members book and pay on the vendor’s own site. We only track who is going.',
  },
  {
    value: 'group',
    label: 'Group booking with a discount',
    hint: 'We collect, and the price per person falls as more people sign up.',
  },
]

/**
 * Booking mode and everything that depends on it.
 *
 * Client-side because which fields are relevant changes with the mode, and
 * showing a vendor URL on an event the committee is collecting for — or a tier
 * ladder on one that has no group rate — is how a form gets filled in wrong.
 */
export function BookingFields({
  defaultMode = 'homekin',
  defaultVendorName = '',
  defaultVendorUrl = '',
  defaultBookingDeadline = '',
  defaultMinGroupSize = '',
  existingTiers = [],
}: {
  defaultMode?: BookingMode
  defaultVendorName?: string
  defaultVendorUrl?: string
  defaultBookingDeadline?: string
  defaultMinGroupSize?: string
  existingTiers?: PriceTier[]
}) {
  const [mode, setMode] = useState<BookingMode>(defaultMode)
  const [tiers, setTiers] = useState<TierRow[]>(
    existingTiers.length > 0
      ? existingTiers.map((t) => ({
          min_headcount: String(t.min_headcount),
          price_per_person: String(t.price_per_person),
        }))
      : [{ min_headcount: '', price_per_person: '' }]
  )

  function patchTier(index: number, partial: Partial<TierRow>) {
    setTiers((prev) => prev.map((row, i) => (i === index ? { ...row, ...partial } : row)))
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How is this booked?</legend>
        <div className="space-y-2">
          {MODES.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-md border p-3 text-sm transition-colors ${
                mode === option.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
              }`}
            >
              <input
                type="radio"
                name="booking_mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="mt-0.5"
              />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode === 'direct' && (
        <div className="space-y-3 border-t pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="vendor_name" className="text-xs">Vendor</Label>
              <Input
                id="vendor_name"
                name="vendor_name"
                defaultValue={defaultVendorName}
                placeholder="Harbour Boat Tours"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vendor_url" className="text-xs">Booking link</Label>
              <Input
                id="vendor_url"
                name="vendor_url"
                type="url"
                defaultValue={defaultVendorUrl}
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="booking_deadline" className="text-xs">Book by</Label>
            <Input
              id="booking_deadline"
              name="booking_deadline"
              type="date"
              defaultValue={defaultBookingDeadline}
            />
            <p className="text-xs text-muted-foreground">
              The vendor’s cut-off, which is usually earlier than the event itself.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            The cost per person above is shown to families so they know what to expect. Nobody is
            billed here and no balance is created — they pay the vendor directly.
          </p>
        </div>
      )}

      {mode === 'group' && (
        <div className="space-y-3 border-t pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="min_group_size" className="text-xs">Minimum group size</Label>
              <Input
                id="min_group_size"
                name="min_group_size"
                type="number"
                min={1}
                defaultValue={defaultMinGroupSize}
                placeholder="10"
              />
              <p className="text-xs text-muted-foreground">
                Warns if signups fall short. It never blocks anyone.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="booking_deadline" className="text-xs">Commit by</Label>
              <Input
                id="booking_deadline"
                name="booking_deadline"
                type="date"
                defaultValue={defaultBookingDeadline}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Group prices</Label>
            <p className="text-xs text-muted-foreground">
              &ldquo;At this many people, everyone pays this much each.&rdquo; The cost per person
              above is the standard rate, so these should be lower.
            </p>
            {tiers.map((tier, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">People</Label>
                  <Input
                    name="tier_min_headcount"
                    type="number"
                    min={1}
                    value={tier.min_headcount}
                    onChange={(e) => patchTier(i, { min_headcount: e.target.value })}
                    placeholder="10"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Each</Label>
                  <Input
                    name="tier_price_per_person"
                    type="number"
                    min={0}
                    step="0.01"
                    value={tier.price_per_person}
                    onChange={(e) => patchTier(i, { price_per_person: e.target.value })}
                    placeholder="45.00"
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="mb-0.5 h-9 w-9 shrink-0"
                  onClick={() => setTiers((prev) => prev.filter((_, index) => index !== i))}
                  aria-label="Remove this group price"
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
                setTiers((prev) => [...prev, { min_headcount: '', price_per_person: '' }])
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add a group price
            </Button>
            <p className="text-xs text-muted-foreground">
              When a threshold is reached everyone on this event is repriced, including families who
              already paid — they end up with a credit rather than losing out for booking early.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
