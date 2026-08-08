'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/copy-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertCircle, Check, Loader2, Mail } from 'lucide-react'
import { sendInviteToMember, type MemberInviteResult } from '@/lib/actions/invite-codes'
import { toast } from '@/components/ui/use-toast'

/**
 * Emails a fresh invite code to one member, straight from their row.
 *
 * Sends on click rather than behind a confirmation step: the address is the one
 * already on screen, and the worst case is a second code — invite codes are
 * single-use and independent, so an extra one costs nothing and the first stays
 * valid until it is redeemed or expires.
 *
 * Only the failure paths open a dialog. When the provider rejects the message
 * the code still exists, so the dialog hands over the link rather than leaving
 * it stranded in the database.
 */
export function InviteMemberButton({
  memberId,
  memberName,
  memberEmail,
}: {
  memberId: string
  memberName: string
  memberEmail: string
}) {
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [problem, setProblem] = useState<MemberInviteResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function send() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await sendInviteToMember(memberId)
        if (result.status === 'sent') {
          setSent(true)
          // Two cues on purpose. The check marks the row you clicked, which
          // matters when working down a list; the toast is the one that says
          // *where* it went and stays up long enough to actually read.
          toast({
            variant: 'success',
            title: `Invite sent to ${memberName}`,
            description: `Emailed to ${memberEmail} — the link is single-use and expires in 30 days.`,
          })
          // Long enough to notice, short enough that the row is ready if they
          // need to send again.
          setTimeout(() => setSent(false), 4000)
          return
        }
        setProblem(result)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The invite could not be sent.')
      }
    })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground"
        onClick={send}
        disabled={isPending || sent}
        title={`Email an invite to ${memberEmail}`}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : sent ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <Mail className="h-4 w-4" />
        )}
        <span className="sr-only">Email an invite to {memberName}</span>
      </Button>

      {error && (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </span>
      )}

      <Dialog open={!!problem} onOpenChange={(open) => !open && setProblem(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {problem?.status === 'created_not_sent'
                ? 'The invite was not delivered'
                : `Could not invite ${memberName}`}
            </DialogTitle>
            <DialogDescription>{problem?.message}</DialogDescription>
          </DialogHeader>

          {problem?.signupUrl && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <code className="min-w-0 flex-1 break-all text-xs">{problem.signupUrl}</code>
              <CopyButton text={problem.signupUrl} />
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setProblem(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
