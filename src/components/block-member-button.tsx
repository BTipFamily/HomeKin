'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, ShieldOff, ShieldCheck } from 'lucide-react'
import { blockMember, unblockMember } from '@/lib/actions/moderation'
import { ACTION_IDLE, type ActionState } from '@/lib/action-state'
import { describeBlock } from '@/lib/moderation'
import { cn } from '@/lib/utils'

/**
 * Blocking somebody, and unblocking them again.
 *
 * One button rather than two, because whether it blocks or unblocks is a fact
 * about the pair of you that the page already knows. A confirm on the way in and
 * none on the way out: blocking is the surprising direction — it removes you
 * from their view as well as them from yours — and lifting a block undoes
 * something rather than doing it.
 */
export function BlockMemberButton({
  memberId,
  memberName,
  blocked,
}: {
  memberId: string
  memberName: string
  blocked: boolean
}) {
  const action = blocked ? unblockMember : blockMember
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action.bind(null, memberId),
    ACTION_IDLE
  )

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!blocked && !window.confirm(describeBlock(memberName))) e.preventDefault()
      }}
      className="contents"
    >
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : blocked ? (
          <ShieldCheck className="mr-1.5 h-4 w-4" />
        ) : (
          <ShieldOff className="mr-1.5 h-4 w-4" />
        )}
        {blocked ? 'Unblock' : 'Block'}
      </Button>

      {state.status !== 'idle' && (
        <span
          role={state.status === 'error' ? 'alert' : undefined}
          className={cn(
            'block w-full text-xs',
            state.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {state.message}
        </span>
      )}
    </form>
  )
}
