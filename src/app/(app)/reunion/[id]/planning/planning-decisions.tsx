'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarCheck, Loader2, MapPin, Plus, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { formatAgendaDay } from '@/lib/agenda'
import {
  decideDateAndPlace,
  removeShortlistedLocation,
  shortlistLocation,
} from '@/lib/actions/planning'

type Window = {
  starts_on: string
  ends_on: string
  households: number
  people: number
  who: string[]
  missing: string[]
}

type ShortlistRow = {
  id: string
  name: string
  city: string | null
  capacity: number | null
  est_cost_per_person: number | null
  accessibility_notes: string | null
}

/**
 * The two decisions everything downstream waits on.
 *
 * Deliberately one component: choosing a date and choosing a place are the
 * same act, and splitting them across two screens is how a committee ends up
 * with a venue that is free on a weekend nobody can travel.
 */
export function PlanningDecisions({
  reunionId,
  windows,
  suggestions,
  shortlist,
  votes,
  currentStartDate,
  currentEndDate,
  currentLocation,
}: {
  reunionId: string
  windows: Window[]
  suggestions: { label: string; households: number; people: number }[]
  shortlist: ShortlistRow[]
  votes: Record<string, number>
  currentStartDate: string | null
  currentEndDate: string | null
  currentLocation: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [startDate, setStartDate] = useState(currentStartDate ?? '')
  const [endDate, setEndDate] = useState(currentEndDate ?? '')
  const [locationId, setLocationId] = useState<string | null>(null)
  const [newPlace, setNewPlace] = useState('')

  function run(action: () => Promise<unknown>) {
    setError(null)
    startTransition(async () => {
      try {
        await action()
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not work.')
      }
    })
  }

  const alreadyShortlisted = new Set(shortlist.map((s) => s.name.trim().toLowerCase()))

  return (
    <div className="space-y-6">
      {/* 1. Top preferred dates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top preferred dates</CardTitle>
          <CardDescription>
            Windows the most households can cover in full. A family counts only if it can make
            every day of it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {windows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody has given exact dates yet — only months. Ask the family to add windows on
              the interest form.
            </p>
          ) : (
            <ul className="space-y-2">
              {windows.map((w) => (
                <li key={w.starts_on}>
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate(w.starts_on)
                      setEndDate(w.ends_on)
                    }}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      startDate === w.starts_on && endDate === w.ends_on
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {formatAgendaDay(w.starts_on)} – {formatAgendaDay(w.ends_on)}
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {w.households} {w.households === 1 ? 'household' : 'households'} ·{' '}
                        {w.people} people
                      </span>
                    </div>
                    {w.missing.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Cannot make it: {w.missing.join(', ')}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 2. Top preferred locations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top preferred locations</CardTitle>
          <CardDescription>
            What the family suggested. Shortlist the good ones and they can be voted on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No suggestions yet.</p>
          ) : (
            <ul className="space-y-1">
              {suggestions.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {s.label}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {s.households} {s.households === 1 ? 'household' : 'households'} · {s.people}{' '}
                      people
                    </span>
                  </span>
                  {alreadyShortlisted.has(s.label.trim().toLowerCase()) ? (
                    <Badge variant="secondary" className="text-[11px]">
                      Shortlisted
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => run(() => shortlistLocation(reunionId, { name: s.label }))}
                    >
                      Shortlist
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-2 border-t pt-4">
            <div className="flex-1 space-y-1">
              <Label htmlFor="new-place" className="text-xs">
                Add a place the family did not name
              </Label>
              <Input
                id="new-place"
                value={newPlace}
                onChange={(e) => setNewPlace(e.target.value)}
                placeholder="Riverside Lodge, Asheville NC"
              />
            </div>
            <Button
              variant="outline"
              disabled={isPending || !newPlace.trim()}
              onClick={() =>
                run(async () => {
                  await shortlistLocation(reunionId, { name: newPlace.trim() })
                  setNewPlace('')
                })
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          {shortlist.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Shortlist — the family votes on these
              </p>
              {shortlist.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => setLocationId(place.id === locationId ? null : place.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors ${
                    locationId === place.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{place.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[
                        place.city,
                        place.capacity ? `holds ${place.capacity}` : null,
                        place.est_cost_per_person
                          ? `${formatCurrency(place.est_cost_per_person)} each`
                          : null,
                        place.accessibility_notes,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'No details yet'}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="tabular-nums">
                      {votes[place.id] ?? 0} {votes[place.id] === 1 ? 'vote' : 'votes'}
                    </Badge>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Remove ${place.name}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        run(() => removeShortlistedLocation(place.id, reunionId))
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation()
                          run(() => removeShortlistedLocation(place.id, reunionId))
                        }
                      }}
                    >
                      <X className="h-4 w-4" />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Decide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Settle the date and place</CardTitle>
          <CardDescription>
            Everything after this waits on it — the budget estimator, the timeline and event
            pricing all need a date and a place to mean anything.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentStartDate && (
            <p className="text-sm text-muted-foreground">
              Currently {formatAgendaDay(currentStartDate)}
              {currentEndDate && ` – ${formatAgendaDay(currentEndDate)}`}
              {currentLocation && ` at ${currentLocation}`}.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="decide-start" className="text-xs">Start</Label>
              <Input
                id="decide-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="decide-end" className="text-xs">End</Label>
              <Input
                id="decide-end"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {shortlist.length > 0 && (
            <p className="text-xs text-muted-foreground">
              <MapPin className="mr-1 inline h-3 w-3" />
              {locationId
                ? `Using ${shortlist.find((s) => s.id === locationId)?.name}.`
                : 'Pick a shortlisted place above, or leave the location as it is.'}
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            disabled={isPending || !startDate}
            onClick={() =>
              run(() =>
                decideDateAndPlace(reunionId, {
                  startDate,
                  endDate: endDate || null,
                  locationId,
                })
              )
            }
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CalendarCheck className="mr-2 h-4 w-4" />
            )}
            Settle it and start planning
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
