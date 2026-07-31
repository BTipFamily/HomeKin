'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { EVENT_FORM_INITIAL, type EventFormState } from '@/lib/event-form'

/**
 * The submit half of the event form: the button, the pending state, and — the
 * reason this exists — somewhere for a failed save to say what went wrong.
 *
 * The fields themselves stay in the page as Server Components and arrive here
 * as `children`, so nothing about them had to move to the client to get an
 * error message on screen.
 */
export default function EventFormShell({
  action,
  submitLabel,
  cancelHref,
  children,
}: {
  action: (state: EventFormState, formData: FormData) => Promise<EventFormState>
  submitLabel: string
  cancelHref: string
  children: React.ReactNode
}) {
  const [state, formAction, pending] = useActionState(action, EVENT_FORM_INITIAL)

  return (
    <form action={formAction} className="space-y-4">
      {children}

      {state.status === 'error' && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            The event was not saved
          </p>
          <p className="mt-1 text-sm text-destructive">{state.message}</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
