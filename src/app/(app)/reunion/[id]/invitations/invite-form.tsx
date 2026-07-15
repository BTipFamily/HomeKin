'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { sendInvitations } from '@/lib/actions/invitations'
import { Send } from 'lucide-react'

interface Member { id: string; name: string; email: string }
interface SubEvent { id: string; name: string }

interface InviteFormProps {
  reunionId: string
  members: Member[]
  subEvents: SubEvent[]
}

export default function InviteForm({ reunionId, members, subEvents }: InviteFormProps) {
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [subEventId, setSubEventId] = useState<string>('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleAll() {
    if (selected.size === members.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(members.map((m) => m.id)))
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleSend() {
    if (selected.size === 0) return setError('Select at least one member')
    setError(null)
    startTransition(async () => {
      try {
        await sendInvitations(reunionId, [...selected], subEventId || null)
        setSuccess(true)
        setSelected(new Set())
      } catch (e: any) {
        setError(e.message)
      }
    })
  }

  return (
    <div className="space-y-4">
      {success && (
        <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700">
          Invitations sent!
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1.5">Event (optional)</label>
        <select
          value={subEventId}
          onChange={(e) => setSubEventId(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">General reunion invite</option>
          {subEvents.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium">Members</label>
          <button onClick={toggleAll} className="text-xs text-muted-foreground hover:text-foreground">
            {selected.size === members.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>
        <div className="max-h-60 overflow-y-auto rounded-md border divide-y">
          {members.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(m.id)}
                onChange={() => toggle(m.id)}
                className="accent-primary"
              />
              <div>
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{selected.size} selected</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSend} disabled={isPending || selected.size === 0}>
        <Send className="mr-2 h-3.5 w-3.5" />
        {isPending ? 'Sending...' : `Send ${selected.size > 0 ? `(${selected.size})` : ''}`}
      </Button>
    </div>
  )
}
