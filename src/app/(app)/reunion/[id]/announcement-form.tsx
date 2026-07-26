'use client'

import { useActionState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { createAnnouncement, type AnnouncementState } from '@/lib/actions/announcements'

const INITIAL: AnnouncementState = { status: 'idle', message: '' }

export function AnnouncementForm({
  reunionId,
  memberCount,
}: {
  reunionId: string
  memberCount: number
}) {
  const [state, formAction, pending] = useActionState(
    createAnnouncement.bind(null, reunionId),
    INITIAL
  )
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.status === 'success' || state.status === 'warning') formRef.current?.reset()
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <p className="text-sm font-medium">Post an Announcement</p>
      <input
        name="title"
        required
        placeholder="Title"
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <textarea
        name="body"
        required
        placeholder="Write your announcement..."
        rows={3}
        className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="pinned" className="rounded" />
            Pin to top
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="notify" defaultChecked className="rounded" />
            Email to all {memberCount} member{memberCount === 1 ? '' : 's'}
          </label>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {pending ? 'Posting...' : 'Post'}
        </Button>
      </div>

      {state.status !== 'idle' && (
        <p
          aria-live="polite"
          className={`rounded-md px-3 py-2 text-sm ${
            state.status === 'success'
              ? 'bg-green-500/10 text-green-700'
              : state.status === 'warning'
              ? 'bg-amber-500/10 text-amber-800'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  )
}
