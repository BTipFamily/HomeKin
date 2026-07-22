'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Printer, RefreshCw, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { TimelineOptions } from '@/lib/timeline-generator'
import type { ReunionTimelineItem, TimelineItemCategory } from '@/types/database'
import { toggleTimelineItem, addCustomTimelineItem, deleteTimelineItem, regenerateTimeline } from '@/lib/actions/timeline'

interface TimelinePageClientProps {
  reunionId: string
  reunionName: string
  startDate: string
  items: ReunionTimelineItem[]
  canManage: boolean
  initialRegenOptions: TimelineOptions
}

const CATEGORY_OPTIONS: TimelineItemCategory[] = [
  'logistics',
  'venue',
  'lodging',
  'rsvp',
  'vendor',
  'merchandise',
  'heritage',
  'final',
]

export function TimelinePageClient({
  reunionId,
  reunionName,
  startDate,
  items,
  canManage,
  initialRegenOptions,
}: TimelinePageClientProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showRegenPanel, setShowRegenPanel] = useState(false)
  const [regenOptions, setRegenOptions] = useState(initialRegenOptions)
  const [newTitle, setNewTitle] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newCategory, setNewCategory] = useState<TimelineItemCategory>('logistics')

  const grouped = useMemo(() => {
    const map = new Map<string, ReunionTimelineItem[]>()
    for (const item of items) {
      const key = item.phase_label ?? 'Custom'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return Array.from(map.entries())
  }, [items])

  const completeCount = items.filter((i) => i.is_complete).length

  function handleToggle(item: ReunionTimelineItem) {
    setError(null)
    startTransition(async () => {
      try {
        await toggleTimelineItem(item.id, reunionId, !item.is_complete)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update item.')
      }
    })
  }

  function handleDelete(itemId: string) {
    setError(null)
    startTransition(async () => {
      try {
        await deleteTimelineItem(itemId, reunionId)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete item.')
      }
    })
  }

  function handleAddCustomItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        await addCustomTimelineItem(reunionId, {
          title: newTitle.trim(),
          dueDate: newDueDate || null,
          category: newCategory,
        })
        setNewTitle('')
        setNewDueDate('')
        setShowAddForm(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to add item.')
      }
    })
  }

  function handleRegenerate() {
    if (
      !confirm(
        'This replaces all auto-generated steps with a fresh set based on your options below. Custom items you added by hand will be kept. Continue?'
      )
    ) {
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await regenerateTimeline(reunionId, startDate, regenOptions)
        setShowRegenPanel(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to regenerate timeline.')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Printable summary */}
      <div className="hidden print:block">
        <h1 className="mb-2 text-2xl font-bold">{reunionName} — Planning Timeline</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          {completeCount} of {items.length} steps complete
        </p>
        {grouped.map(([phase, phaseItems]) => (
          <div key={phase} className="mb-4">
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{phase}</p>
            <ul className="space-y-1 text-sm">
              {phaseItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3">
                  <span>
                    [{item.is_complete ? 'x' : ' '}] {item.title}
                  </span>
                  {item.due_date && <span className="text-muted-foreground">{formatDate(item.due_date)}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="print:hidden space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {completeCount} of {items.length} steps complete
          </p>
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAddForm((v) => !v)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Item
              </Button>
            )}
            {canManage && (
              <Button type="button" variant="outline" size="sm" onClick={() => setShowRegenPanel((v) => !v)}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Regenerate
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print / Save
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {showAddForm && (
          <Card>
            <CardContent className="pt-4">
              <form onSubmit={handleAddCustomItem} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="new-title">Step title</Label>
                  <Input
                    id="new-title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Reserve the pavilion"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="new-due-date">Due date</Label>
                    <Input
                      id="new-due-date"
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={newCategory} onValueChange={(v) => setNewCategory(v as TimelineItemCategory)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" size="sm" disabled={isPending}>
                  Add
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {showRegenPanel && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <p className="text-sm font-medium">Reunion Options</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={regenOptions.multiDay}
                  onChange={(e) => setRegenOptions({ ...regenOptions, multiDay: e.target.checked })}
                />
                Multi-day reunion
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={regenOptions.lodging}
                  onChange={(e) => setRegenOptions({ ...regenOptions, lodging: e.target.checked })}
                />
                Hotel block / lodging coordination
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={regenOptions.merchandise}
                  onChange={(e) => setRegenOptions({ ...regenOptions, merchandise: e.target.checked })}
                />
                Reunion shirts / merchandise
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={regenOptions.heritage}
                  onChange={(e) => setRegenOptions({ ...regenOptions, heritage: e.target.checked })}
                />
                Heritage / genealogy activity
              </label>
              <Button type="button" size="sm" onClick={handleRegenerate} disabled={isPending}>
                {isPending ? 'Regenerating...' : 'Regenerate Timeline'}
              </Button>
            </CardContent>
          </Card>
        )}

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            <p>No timeline steps yet.</p>
            {canManage && (
              <p className="mt-1 text-sm">Use Regenerate above to build one from your reunion date.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([phase, phaseItems]) => (
              <Card key={phase}>
                <CardContent className="pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{phase}</p>
                  <div className="divide-y">
                    {phaseItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 py-2">
                        <label className="flex flex-1 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={item.is_complete}
                            onChange={() => handleToggle(item)}
                          />
                          <span className={item.is_complete ? 'text-muted-foreground line-through' : ''}>
                            {item.title}
                          </span>
                        </label>
                        <div className="flex shrink-0 items-center gap-2">
                          {item.due_date && (
                            <span className="text-xs text-muted-foreground">{formatDate(item.due_date)}</span>
                          )}
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
