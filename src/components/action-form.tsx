'use client'

import { useActionState, type ReactNode } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { ACTION_IDLE, type ActionState } from '@/lib/action-state'
import { cn } from '@/lib/utils'

/**
 * A form that can report why it failed.
 *
 * Generalised from `events/event-form-shell.tsx`, and the important part is the
 * same: the fields stay in the page as Server Components and arrive here as
 * `children`. Only the submit button and the message slot are on the client, so
 * a two-hundred-line server-rendered form gets an error message without any of
 * it moving.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  errorTitle = 'That could not be saved',
  cancelHref,
  className,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  submitLabel: string
  /** Shown while in flight, when the verb is worth changing. */
  pendingLabel?: string
  /** Names what failed, above the message from the server. */
  errorTitle?: string
  cancelHref?: string
  className?: string
  children: ReactNode
}) {
  const [state, formAction, pending] = useActionState(action, ACTION_IDLE)

  return (
    <form action={formAction} className={cn('space-y-4', className)}>
      {children}

      <ActionMessage state={state} errorTitle={errorTitle} />

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {pending && pendingLabel ? pendingLabel : submitLabel}
        </Button>
        {cancelHref && (
          <Button type="button" variant="outline" asChild>
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        )}
      </div>
    </form>
  )
}

/**
 * The message itself, split out because the row-level buttons need it too.
 *
 * `aria-live` rather than `role="alert"` for the non-error states: a save that
 * worked should be announced without interrupting.
 */
export function ActionMessage({
  state,
  errorTitle,
  className,
}: {
  state: ActionState
  errorTitle?: string
  className?: string
}) {
  if (state.status === 'idle') return null

  if (state.status === 'error') {
    return (
      <div
        role="alert"
        className={cn(
          'rounded-md border border-destructive/40 bg-destructive/5 p-3',
          className
        )}
      >
        {errorTitle && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {errorTitle}
          </p>
        )}
        <p className={cn('text-sm text-destructive', errorTitle && 'mt-1')}>{state.message}</p>
      </div>
    )
  }

  const warning = state.status === 'warning'

  return (
    <div
      aria-live="polite"
      className={cn(
        'flex items-start gap-1.5 rounded-md border p-3 text-sm',
        warning
          ? 'border-warning-border bg-warning-surface text-warning-foreground'
          : 'border-success-border bg-success-surface text-success-foreground',
        className
      )}
    >
      {warning ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span>{state.message}</span>
    </div>
  )
}
