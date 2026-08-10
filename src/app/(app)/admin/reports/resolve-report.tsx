'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { resolveReport } from '@/lib/actions/moderation'
import { ActionMessage } from '@/components/action-form'
import { ACTION_IDLE, type ActionState } from '@/lib/action-state'

/**
 * Closing a report, with the note attached.
 *
 * One form, two submit buttons carrying different `value`s for the same `status`
 * field — rather than an ActionButton per decision. Two ActionButtons would mean
 * two forms, and the shared note field can only live in one of them; putting it
 * in a wrapping form instead would nest forms, which browsers do not allow and
 * React does not warn about until it silently misbehaves.
 */
export function ResolveReport({ reportId }: { reportId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    resolveReport,
    ACTION_IDLE
  )

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="report_id" value={reportId} />

      <div className="flex flex-wrap items-center gap-2">
        <input
          name="review_note"
          placeholder="Note for the record (optional)"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button type="submit" name="status" value="actioned" size="sm" disabled={pending}>
          {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Dealt with
        </Button>
        <Button
          type="submit"
          name="status"
          value="dismissed"
          size="sm"
          variant="outline"
          disabled={pending}
        >
          Dismiss
        </Button>
      </div>

      <ActionMessage state={state} errorTitle="That report was not updated" />
    </form>
  )
}
