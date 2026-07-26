'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import { markChannelRead, sendMessage } from '@/lib/actions/chat'
import {
  latestServerTimestamp,
  makeOptimisticId,
  mergeMessages,
  type ChatMessage,
} from '@/lib/chat'
import { buildRoster, countActive, type RosterMember } from '@/lib/presence'
import { AlertCircle, Send, Users } from 'lucide-react'

const POLL_INTERVAL_MS = 5000

/** Where the cursor starts when a chat has no confirmed messages yet. */
const EPOCH = new Date(0).toISOString()

interface ChatClientProps {
  reunionId: string
  subEventId: string | null
  initialMessages: ChatMessage[]
  currentMember: { id: string; name: string; photo_url: string | null }
  roster: RosterMember[]
}

export default function ChatClient({
  reunionId,
  subEventId,
  initialMessages,
  currentMember,
  roster: initialRoster,
}: ChatClientProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [roster, setRoster] = useState(initialRoster)
  const [showRoster, setShowRoster] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)

  // Only ever advanced from confirmed messages. Moving it to a placeholder's
  // client timestamp is what hid the real row from the poll and left the
  // duplicate on screen.
  const cursor = useRef(latestServerTimestamp(initialMessages, EPOCH))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Opening the chat means everything in it has been seen.
  useEffect(() => {
    void markChannelRead(reunionId, subEventId).catch(() => {})
  }, [reunionId, subEventId])

  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const params = new URLSearchParams({
          reunion_id: reunionId,
          since: cursor.current,
        })
        if (subEventId) params.set('sub_event_id', subEventId)

        const res = await fetch(`/api/messages?${params}`)
        if (!res.ok) return
        const { messages: incoming, roster: freshRoster } = await res.json()

        if (Array.isArray(freshRoster)) setRoster(freshRoster)

        if (Array.isArray(incoming) && incoming.length > 0) {
          setMessages((prev) => {
            const merged = mergeMessages(prev, incoming)
            cursor.current = latestServerTimestamp(merged, cursor.current)
            return merged
          })
          void markChannelRead(reunionId, subEventId).catch(() => {})
        }
      } catch {
        // Network blip — the next poll picks up whatever was missed, because
        // the cursor only moves on success.
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [reunionId, subEventId])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return

    setBody('')
    setError(null)

    const placeholder: ChatMessage = {
      id: makeOptimisticId(),
      body: text,
      created_at: new Date().toISOString(),
      sender: currentMember,
    }
    setMessages((prev) => [...prev, placeholder])

    startTransition(async () => {
      try {
        const saved = await sendMessage(reunionId, text, subEventId)
        // Swap the placeholder for the real row. Without this the poll would
        // fetch the same message again and show it twice.
        setMessages((prev) => {
          const merged = mergeMessages(
            prev.filter((m) => m.id !== placeholder.id),
            [saved]
          )
          cursor.current = latestServerTimestamp(merged, cursor.current)
          return merged
        })
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== placeholder.id))
        setBody(text)
        setError(err instanceof Error ? err.message : 'That message did not send.')
      }
    })
  }

  const entries = buildRoster(roster)
  const activeCount = countActive(entries)

  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-2">
        <button
          onClick={() => setShowRoster((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
          </span>
          {activeCount} active now
          <Users className="ml-0.5 h-3.5 w-3.5" />
        </button>
        {showRoster && (
          <span className="text-xs text-muted-foreground">{entries.length} in the directory</span>
        )}
      </div>

      {showRoster && (
        <div className="max-h-48 overflow-y-auto border-b bg-muted/30 px-4 py-2">
          <ul className="space-y-1.5">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 text-sm">
                <span className="relative">
                  <Avatar className="h-6 w-6">
                    {entry.photo_url && <AvatarImage src={entry.photo_url} alt={entry.name} />}
                    <AvatarFallback className="text-[10px]">
                      {getInitials(entry.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-background ${
                      entry.presence === 'active'
                        ? 'bg-green-500'
                        : entry.presence === 'today'
                        ? 'bg-amber-400'
                        : 'bg-muted-foreground/40'
                    }`}
                  />
                </span>
                <span className={entry.presence === 'away' ? 'text-muted-foreground' : ''}>
                  {entry.name}
                  {entry.id === currentMember.id && (
                    <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Green means active in the last few minutes. Everyone here can read this chat and will
            see a badge for anything they have not read.
          </p>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender?.id === currentMember.id
            const sending = msg.id.startsWith('pending:')
            return (
              <div
                key={msg.id}
                className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {!isMe && (
                  <Avatar className="h-7 w-7 shrink-0">
                    {msg.sender?.photo_url && (
                      <AvatarImage src={msg.sender.photo_url} alt={msg.sender.name} />
                    )}
                    <AvatarFallback className="text-xs">
                      {getInitials(msg.sender?.name ?? '?')}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={`flex max-w-[75%] flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && (
                    <span className="mb-0.5 ml-1 text-xs text-muted-foreground">
                      {msg.sender?.name}
                    </span>
                  )}
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      isMe
                        ? 'rounded-br-sm bg-primary text-primary-foreground'
                        : 'rounded-bl-sm bg-muted'
                    } ${sending ? 'opacity-60' : ''}`}
                  >
                    {msg.body}
                  </div>
                  <span className="mx-1 mt-0.5 text-[10px] text-muted-foreground">
                    {sending
                      ? 'Sending…'
                      : new Date(msg.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                  </span>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t px-4 py-3">
        {error && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message…"
            className="h-10 flex-1 rounded-full border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!body.trim() || isPending}
            className="h-10 w-10 rounded-full"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </>
  )
}
