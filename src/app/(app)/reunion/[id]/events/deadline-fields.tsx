'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2 } from 'lucide-react'
import type { EventDeadline } from '@/types/database'

/**
 * The repeating payment-deadline rows on the event form.
 *
 * Every field posts under a shared name, so the browser sends parallel arrays
 * that `parseDeadlinesFromForm` zips back together. Rows carry a hidden id:
 * editing an event updates the rows that come back and deletes the ones that do
 * not, rather than replacing the lot — which would take the reminder log with
 * it through the cascade and let already-sent reminders go out a second time.
 */

type Row = {
  /** Empty for a row added in this session. */
  id: string
  label: string
  dueDate: string
  amountType: 'percent' | 'fixed_per_person' | 'remainder'
  amountValue: string
  reminderOffsets: string
}

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

function blankRow(): Row {
  return {
    id: '',
    label: '',
    dueDate: '',
    amountType: 'percent',
    amountValue: '',
    reminderOffsets: '14, 3',
  }
}

function toRow(deadline: EventDeadline): Row {
  return {
    id: deadline.id,
    label: deadline.label,
    dueDate: deadline.due_date.slice(0, 10),
    amountType: deadline.amount_type,
    amountValue: deadline.amount_value === null ? '' : String(deadline.amount_value),
    reminderOffsets: deadline.reminder_offsets.join(', '),
  }
}

interface DeadlineFieldsProps {
  /** Existing checkpoints when editing; empty when creating. */
  existing?: EventDeadline[]
}

export default function DeadlineFields({ existing = [] }: DeadlineFieldsProps) {
  const [rows, setRows] = useState<Row[]>(existing.map(toRow))

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function remove(index: number) {
    setRows((current) => current.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed p-4">
      <div>
        <Label className="text-sm font-medium">Payment deadlines</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Optional. Set checkpoints for when money is due — a deposit, then the balance.
          Members are emailed a reminder before each one. Leave empty and the whole cost is
          simply due.
        </p>
      </div>

      {rows.map((row, index) => (
        <div key={index} className="space-y-2 rounded-md border bg-muted/30 p-3">
          <input type="hidden" name="deadline_id" value={row.id} />

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`deadline_label_${index}`}>
                Name
              </Label>
              <Input
                id={`deadline_label_${index}`}
                name="deadline_label"
                value={row.label}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder="Deposit"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`deadline_due_date_${index}`}>
                Due by
              </Label>
              <Input
                id={`deadline_due_date_${index}`}
                name="deadline_due_date"
                type="date"
                value={row.dueDate}
                onChange={(e) => update(index, { dueDate: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`deadline_amount_type_${index}`}>
                Amount is
              </Label>
              <select
                id={`deadline_amount_type_${index}`}
                name="deadline_amount_type"
                className={SELECT_CLASS}
                value={row.amountType}
                onChange={(e) =>
                  update(index, { amountType: e.target.value as Row['amountType'] })
                }
              >
                <option value="percent">A percentage</option>
                <option value="fixed_per_person">A fixed amount per person</option>
                <option value="remainder">Whatever is left</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`deadline_amount_value_${index}`}>
                {row.amountType === 'percent' ? 'Percent' : 'Amount ($)'}
              </Label>
              <Input
                id={`deadline_amount_value_${index}`}
                name="deadline_amount_value"
                type="number"
                step={row.amountType === 'percent' ? '1' : '0.01'}
                min="0"
                value={row.amountType === 'remainder' ? '' : row.amountValue}
                onChange={(e) => update(index, { amountValue: e.target.value })}
                disabled={row.amountType === 'remainder'}
                placeholder={row.amountType === 'percent' ? '25' : '50.00'}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs" htmlFor={`deadline_reminder_offsets_${index}`}>
                Remind (days before)
              </Label>
              <Input
                id={`deadline_reminder_offsets_${index}`}
                name="deadline_reminder_offsets"
                value={row.reminderOffsets}
                onChange={(e) => update(index, { reminderOffsets: e.target.value })}
                placeholder="14, 3"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(index)}
              className="text-muted-foreground"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Remove
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setRows((current) => [...current, blankRow()])}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Add deadline
      </Button>
    </div>
  )
}
