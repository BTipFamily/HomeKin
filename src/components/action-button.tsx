'use client'

import { useActionState, type ComponentProps, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { ACTION_IDLE, type ActionState } from '@/lib/action-state'
import { cn } from '@/lib/utils'

/**
 * A one-button form that can say why it failed.
 *
 * Separate from ActionForm because these live inside a `.map()` — a delete on
 * every photo, a role change on every member — and each row needs its own
 * `useActionState`. One shared state across a list would put a failure on the
 * wrong row, which is worse than no message at all.
 *
 * `hiddenFields` covers the buttons whose action still reads FormData; buttons
 * whose action takes its arguments bound don't need it.
 */
export function ActionButton({
  action,
  label,
  hiddenFields,
  confirm,
  variant = 'ghost',
  size = 'sm',
  className,
  messageClassName,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  /** Accessible name, used when `children` is only an icon. */
  label: string
  hiddenFields?: Record<string, string>
  /** Asked before submitting, for the destructive ones. */
  confirm?: string
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
  className?: string
  messageClassName?: string
  children?: ReactNode
}) {
  const [state, formAction, pending] = useActionState(action, ACTION_IDLE)

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault()
      }}
      className="contents"
    >
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      <Button type="submit" variant={variant} size={size} disabled={pending} className={className}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
        {!children && <span className="sr-only">{label}</span>}
      </Button>

      {/* Inline and terse: there is rarely room for a panel next to a row
          action, and the message has to stay attached to the row it belongs
          to. */}
      {state.status !== 'idle' && (
        <span
          role={state.status === 'error' ? 'alert' : undefined}
          className={cn(
            'block text-xs',
            state.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
            messageClassName
          )}
        >
          {state.message}
        </span>
      )}
    </form>
  )
}
