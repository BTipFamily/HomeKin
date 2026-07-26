'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  deleteReunion,
  previewReunionDeletion,
  type ReunionDeletionPreview,
} from '@/lib/actions/reunion-delete'

export function DeleteReunion({
  reunionId,
  reunionName,
}: {
  reunionId: string
  reunionName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [preview, setPreview] = useState<ReunionDeletionPreview | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState<string | null>(null)

  function openDialog() {
    setOpen(true)
    setPreview(null)
    setConfirmName('')
    setError(null)
    startTransition(async () => {
      try {
        setPreview(await previewReunionDeletion(reunionId))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load this reunion.')
      }
    })
  }

  function confirmDelete() {
    setError(null)
    startTransition(async () => {
      try {
        const outcome = await deleteReunion(reunionId, confirmName)
        // The page we are standing on no longer exists, so leave before
        // anything tries to re-render it.
        const note = outcome.storageWarning
          ? `?deleted=${encodeURIComponent(outcome.name)}&warning=${encodeURIComponent(outcome.storageWarning)}`
          : `?deleted=${encodeURIComponent(outcome.name)}`
        router.replace(`/dashboard${note}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The delete failed.')
      }
    })
  }

  const nameMatches = confirmName.trim().toLowerCase() === reunionName.trim().toLowerCase()

  return (
    <Card className="mt-8 border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Deleting this reunion removes its events, signups, balances, photos, surveys and
          messages. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={openDialog}>
          <Trash2 className="mr-1.5 h-4 w-4" />
          Delete this reunion
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete {reunionName}?</DialogTitle>
            <DialogDescription>
              Everything belonging to this reunion goes with it. There is no undo and no backup.
            </DialogDescription>
          </DialogHeader>

          {isPending && !preview && (
            <p className="text-sm text-muted-foreground">Checking what this would remove...</p>
          )}

          {preview && (
            <div className="space-y-4">
              {preview.losses.length > 0 ? (
                <div>
                  <p className="text-sm font-medium">This will delete</p>
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
                  This reunion has no events, signups or photos — nothing else is affected.
                </p>
              )}

              {preview.warnings.map((message, i) => (
                <p
                  key={i}
                  className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {message}
                </p>
              ))}

              <div className="space-y-2">
                <Label htmlFor="confirm-reunion">
                  Type <strong>{reunionName}</strong> to confirm
                </Label>
                <Input
                  id="confirm-reunion"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={reunionName}
                  autoComplete="off"
                />
              </div>
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
              disabled={!preview || !nameMatches || isPending}
            >
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
