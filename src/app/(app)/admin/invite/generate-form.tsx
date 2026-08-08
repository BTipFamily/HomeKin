'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle2, Link2 } from 'lucide-react'
import { generateInviteCode, type InviteCodeState } from '@/lib/actions/invite-codes'
import { CopyButton } from '@/components/copy-button'

const INITIAL: InviteCodeState = { status: 'idle', message: '' }

export function GenerateInviteForm() {
  const [state, formAction, pending] = useActionState(generateInviteCode, INITIAL)

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="send_to">Email it to (optional)</Label>
          <Input
            id="send_to"
            name="send_to"
            type="email"
            placeholder="cousin@example.com"
            className="w-64"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="expires_in_days">Expires in (days)</Label>
          <Input
            id="expires_in_days"
            name="expires_in_days"
            type="number"
            defaultValue="30"
            min="1"
            max="365"
            className="w-32"
          />
        </div>
        <Button type="submit" disabled={pending}>
          <Link2 className="mr-1.5 h-4 w-4" />
          {pending ? 'Working...' : 'Generate Code'}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        Leave the address blank to just create a code and share the link yourself.
      </p>

      {state.status !== 'idle' && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            state.status === 'success'
              ? 'border-green-200 bg-green-50 text-green-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            {state.status === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div className="min-w-0 space-y-2">
              <p>{state.message}</p>
              {state.signupUrl && (
                <div className="flex flex-wrap items-center gap-2">
                  <code className="break-all rounded bg-white/70 px-2 py-1 text-xs">
                    {state.signupUrl}
                  </code>
                  <CopyButton text={state.signupUrl} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
