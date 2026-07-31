'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { validateDeadlines } from '@/lib/payment-schedule'
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

  /**
   * The same validation the server runs, shown as the committee types.
   *
   * Without this the server's messages were unreachable: a thrown Server Action
   * renders Next's generic "a server error occurred" with the reason stripped,
   * so "the percentages add up to 115%" was written, thrown, and never seen by
   * anybody. The server still validates — this is the copy that gets read.
   *
   * The event's own date is not checked here, because it lives in a sibling
   * field this component cannot see. The server still catches a deadline that
   * falls after the event.
   */
  const errors = useMemo(
    () =>
      validateDeadlines(
        rows.map((row) => ({
          id: row.id || null,
          label: row.label,
          due_date: row.dueDate,
          amount_type: row.amountType,
          amount_value:
            row.amountType === 'remainder' || row.amountValue.trim() === ''
              ? null
              : Number(row.amountValue),
          reminder_offsets: row.reminderOffsets
            .split(/[,\s]+/)
            .filter(Boolean)
            .map(Number)
            .filter((n) => Number.isFinite(n)),
        })),
        null
      ),
    [rows]
  )

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

      {rows.map((row, index) => {
        // A row counts as started the moment anything is typed into it. Once it
        // has, the browser enforces the rest before the form will submit, which
        // puts the complaint on the field itself rather than making somebody
        // save, wait, and read a message about "Deadline 1". A row left
        // untouched stays optional and is ignored on save, so clicking "Add
        // deadline" and changing your mind is not a trap.
        const started =
          row.label.trim() !== '' || row.dueDate !== '' || row.amountValue.trim() !== ''
        const needsAmount = started && row.amountType !== 'remainder'

        return (
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
                required={started}
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
                required={started}
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
              {/*
                readOnly, never disabled. A disabled input is not submitted at
                all, which knocks this field's array out of step with the other
                five and makes the parser pair a label with the wrong amount —
                or drop a deadline entirely.
              */}
              <Input
                id={`deadline_amount_value_${index}`}
                name="deadline_amount_value"
                type={row.amountType === 'remainder' ? 'text' : 'number'}
                step={row.amountType === 'percent' ? '1' : '0.01'}
                min="0"
                required={needsAmount}
                value={row.amountType === 'remainder' ? '' : row.amountValue}
                onChange={(e) => update(index, { amountValue: e.target.value })}
                readOnly={row.amountType === 'remainder'}
                aria-disabled={row.amountType === 'remainder'}
                className={row.amountType === 'remainder' ? 'bg-muted text-muted-foreground' : ''}
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
        )
      })}

      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Fix these before saving
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-destructive">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

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
