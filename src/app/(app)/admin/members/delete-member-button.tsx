'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertCircle, Loader2, Trash2 } from 'lucide-react'
import {
  deleteMember,
  previewMemberDeletion,
  type DeletionOutcome,
  type DeletionPreview,
} from '@/lib/actions/member-delete'

export function DeleteMemberButton({
  memberId,
  memberName,
  isSelf,
}: {
  memberId: string
  memberName: string
  isSelf: boolean
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [preview, setPreview] = useState<DeletionPreview | null>(null)
  const [outcome, setOutcome] = useState<DeletionOutcome | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState<string | null>(null)

  function openDialog() {
    setOpen(true)
    setPreview(null)
    setOutcome(null)
    setConfirmName('')
    setError(null)
    startTransition(async () => {
      try {
        setPreview(await previewMemberDeletion(memberId))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load this member.')
      }
    })
  }

  function confirmDelete() {
    setError(null)
    startTransition(async () => {
      try {
        setOutcome(await deleteMember(memberId, confirmName))
        setPreview(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The delete failed.')
      }
    })
  }

  const nameMatches = confirmName.trim().toLowerCase() === memberName.trim().toLowerCase()
  const blocked = (preview?.blockers.length ?? 0) > 0

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={openDialog}
        disabled={isSelf}
        title={isSelf ? 'You cannot delete your own profile' : `Delete ${memberName}`}
      >
        <Trash2 className="h-4 w-4" />
        <span className="sr-only">Delete {memberName}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {outcome ? (
            <>
              <DialogHeader>
                <DialogTitle>Deleted {outcome.name}</DialogTitle>
                <DialogDescription>
                  {outcome.email} has been removed from the directory.
                </DialogDescription>
              </DialogHeader>
              {outcome.losses.length > 0 && (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {outcome.losses.map((l) => (
                    <li key={l.label}>
                      {l.label}: {l.count}
                    </li>
                  ))}
                </ul>
              )}
              {outcome.loginRevoked && (
                <p className="text-sm text-muted-foreground">Their login was revoked.</p>
              )}
              {outcome.loginWarning && (
                <p className="flex items-start gap-1.5 text-sm text-warning-foreground">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {outcome.loginWarning}
                </p>
              )}
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Delete {memberName}?</DialogTitle>
                <DialogDescription>
                  This permanently removes their profile and everything belonging to it. It
                  cannot be undone. If this is a duplicate of someone else, merging keeps their
                  history instead.
                </DialogDescription>
              </DialogHeader>

              {isPending && !preview && (
                <p className="text-sm text-muted-foreground">Checking what this would remove...</p>
              )}

              {preview && (
                <div className="space-y-4">
                  {preview.blockers.map((message, i) => (
                    <p
                      key={i}
                      className="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      {message}
                    </p>
                  ))}

                  {preview.losses.length > 0 ? (
                    <div>
                      <p className="text-sm font-medium">This will also delete</p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {preview.losses.map((l) => (
                          <li
                            key={l.label}
                            className="flex items-center justify-between rounded border px-3 py-1.5"
                          >
                            <span className="text-muted-foreground">{l.label}</span>
                            <span className="font-medium">{l.count}</span>
                          </li>
                        ))}
                      </ul>
                      {(preview.amountOwed > 0 || preview.amountPaid > 0) && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Covering ${preview.amountPaid.toFixed(2)} paid of $
                          {preview.amountOwed.toFixed(2)} owed.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      They have no signups, balances or relationships — nothing else is affected.
                    </p>
                  )}

                  {preview.warnings.map((message, i) => (
                    <p
                      key={i}
                      className="flex items-start gap-1.5 rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning-foreground"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      {message}
                    </p>
                  ))}

                  {!blocked && (
                    <div className="space-y-2">
                      <Label htmlFor={`confirm-${memberId}`}>
                        Type <strong>{memberName}</strong> to confirm
                      </Label>
                      <Input
                        id={`confirm-${memberId}`}
                        value={confirmName}
                        onChange={(e) => setConfirmName(e.target.value)}
                        placeholder={memberName}
                        autoComplete="off"
                      />
                    </div>
                  )}
                </div>
              )}

              {error && (
                <p className="flex items-start gap-1.5 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDelete}
                  disabled={!preview || blocked || !nameMatches || isPending}
                >
                  {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Delete permanently
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
