'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { deleteMyAccount, previewMyAccountDeletion } from '@/lib/actions/account'
import { describeAccountLoss, type AccountDeletionPreview } from '@/lib/account'

/**
 * Closing your own account.
 *
 * Modelled on DeleteMemberButton, with one difference that matters: there is no
 * `isSelf` guard, because this is the self case. The admin tool refuses it — see
 * migration 013 — and that refusal is exactly what left nobody able to leave.
 *
 * Nothing here is hidden behind an accordion or a support address. App Store
 * guideline 5.1.1(v) asks for account deletion the person can find and complete
 * themselves, and a reviewer has to be able to reach it in a few taps.
 */
export function DeleteAccount() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState<string | null>(null)

  function openDialog() {
    setOpen(true)
    setPreview(null)
    setConfirmName('')
    setError(null)
    startTransition(async () => {
      setPreview(await previewMyAccountDeletion())
    })
  }

  function confirmDelete() {
    setError(null)
    startTransition(async () => {
      const result = await deleteMyAccount(confirmName)
      if (!result.ok) {
        setError(result.message)
        return
      }
      // The account is gone and the session with it. Going through the goodbye
      // page rather than straight to /login means the last thing somebody sees
      // is confirmation that it worked, not a login form that looks like a
      // failure. router.refresh() clears the cached session on the way.
      const params = new URLSearchParams({ name: result.name })
      if (result.loginWarning) params.set('warning', result.loginWarning)
      router.replace(`/goodbye?${params.toString()}`)
      router.refresh()
    })
  }

  const ready = preview?.ok === true
  const blocked = ready && preview.blocker !== null
  const nameMatches =
    ready && confirmName.trim().toLowerCase() === preview.name.trim().toLowerCase()

  return (
    <>
      <Button variant="destructive" onClick={openDialog}>
        <Trash2 className="mr-1.5 h-4 w-4" />
        Delete my account
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This removes your profile from the family directory permanently. There is no undo,
              and no copy kept for an admin to restore.
            </DialogDescription>
          </DialogHeader>

          {isPending && !preview && (
            <p className="text-sm text-muted-foreground">Checking what this would remove…</p>
          )}

          {preview && !preview.ok && (
            <p className="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {preview.message}
            </p>
          )}

          {ready && (
            <div className="space-y-4">
              {preview.blocker && (
                <p className="flex items-start gap-1.5 rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning-foreground">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {preview.blocker}
                </p>
              )}

              {preview.losses.length > 0 && (
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
                </div>
              )}

              <ul className="space-y-2 text-sm text-muted-foreground">
                {describeAccountLoss(preview).map((warning, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>

              {!blocked && (
                <div className="space-y-1">
                  <Label htmlFor="confirm-name">
                    Type <strong>{preview.name}</strong> to confirm
                  </Label>
                  <Input
                    id="confirm-name"
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    autoComplete="off"
                    placeholder={preview.name}
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Keep my account
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isPending || !ready || blocked || !nameMatches}
            >
              {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
