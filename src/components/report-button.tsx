'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Flag, Loader2 } from 'lucide-react'
import { reportContent } from '@/lib/actions/moderation'
import { ActionMessage } from '@/components/action-form'
import { ACTION_IDLE, type ActionState } from '@/lib/action-state'
import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  REPORTABLE_TYPE_LABELS,
  type ReportableType,
} from '@/lib/moderation'
import { cn } from '@/lib/utils'

/**
 * Reporting a photograph, a comment, a message or a person.
 *
 * One component for all of them: App Store guideline 1.2 asks for a way to
 * report content, and a report button that exists on photos but not on comments
 * is the same as not having one. The content type only changes the wording.
 *
 * Deliberately quiet in the interface — an outline icon, not a red warning. A
 * report button that shouts turns every album into an invitation to complain,
 * and one that is hidden might as well not exist.
 */
export function ReportButton({
  contentType,
  contentId,
  reunionId,
  /** Named in the dialog so nobody reports the wrong thing. */
  subject,
  variant = 'ghost',
  size = 'icon',
  className,
  children,
}: {
  contentType: ReportableType
  contentId: string
  reunionId?: string | null
  subject?: string | null
  variant?: 'ghost' | 'outline'
  size?: 'icon' | 'sm'
  className?: string
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    reportContent,
    ACTION_IDLE
  )

  const noun = REPORTABLE_TYPE_LABELS[contentType]
  const sent = state.status === 'success'

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn('text-muted-foreground', className)}
        onClick={() => setOpen(true)}
      >
        <Flag className={size === 'icon' ? 'h-3.5 w-3.5' : 'mr-1.5 h-3.5 w-3.5'} />
        {children ?? <span className="sr-only">Report this {noun}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report this {noun}</DialogTitle>
            <DialogDescription>
              {subject ? `${subject} — ` : ''}
              This goes to your reunion committee, who will look at it. The person is not told who
              reported them. If you would rather not see them at all, you can block them instead.
            </DialogDescription>
          </DialogHeader>

          {sent ? (
            <>
              <ActionMessage state={state} />
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          ) : (
            <form action={formAction} className="space-y-4">
              <input type="hidden" name="content_type" value={contentType} />
              <input type="hidden" name="content_id" value={contentId} />
              {reunionId && <input type="hidden" name="reunion_id" value={reunionId} />}

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">What is wrong with it?</legend>
                {REPORT_REASONS.map((reason, i) => (
                  <label key={reason} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="reason"
                      value={reason}
                      defaultChecked={i === 0}
                      className="accent-primary"
                    />
                    {REPORT_REASON_LABELS[reason]}
                  </label>
                ))}
              </fieldset>

              <div className="space-y-1">
                <Label htmlFor="report-detail">
                  Anything to add?{' '}
                  <span className="font-normal text-muted-foreground">
                    (needed if you picked &ldquo;Something else&rdquo;)
                  </span>
                </Label>
                <textarea
                  id="report-detail"
                  name="detail"
                  rows={3}
                  maxLength={1000}
                  className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="What should the committee look at?"
                />
              </div>

              <ActionMessage state={state} errorTitle="That report was not sent" />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Send report
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
