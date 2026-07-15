'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import { postMessage } from '@/lib/actions/messages'
import { Send } from 'lucide-react'

interface Message {
  id: string
  body: string
  created_at: string
  sender: { id: string; name: string; photo_url: string | null } | null
}

interface ChatClientProps {
  reunionId: string
  subEventId: string | null
  initialMessages: Message[]
  currentMember: { id: string; name: string; photo_url: string | null }
}

export default function ChatClient({
  reunionId,
  subEventId,
  initialMessages,
  currentMember,
}: ChatClientProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastTimestamp = useRef<string>(
    initialMessages[initialMessages.length - 1]?.created_at ?? new Date(0).toISOString()
  )

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Poll for new messages every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const params = new URLSearchParams({
          reunion_id: reunionId,
          since: lastTimestamp.current,
        })
        if (subEventId) params.set('sub_event_id', subEventId)
        const res = await fetch(`/api/messages?${params}`)
        if (!res.ok) return
        const { messages: newMsgs } = await res.json()
        if (newMsgs.length > 0) {
          setMessages((prev) => [...prev, ...newMsgs])
          lastTimestamp.current = newMsgs[newMsgs.length - 1].created_at
        }
      } catch {
        // Network error — poll will retry
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [reunionId, subEventId])

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    const text = body.trim()
    setBody('')

    // Optimistic update
    const optimistic: Message = {
      id: `opt-${Date.now()}`,
      body: text,
      created_at: new Date().toISOString(),
      sender: currentMember,
    }
    setMessages((prev) => [...prev, optimistic])
    lastTimestamp.current = optimistic.created_at

    startTransition(async () => {
      await postMessage(reunionId, text, subEventId)
    })
  }

  return (
    <>
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender?.id === currentMember.id
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
                <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!isMe && (
                    <span className="text-xs text-muted-foreground mb-0.5 ml-1">
                      {msg.sender?.name}
                    </span>
                  )}
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      isMe
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted rounded-bl-sm'
                    }`}
                  >
                    {msg.body}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5 mx-1">
                    {new Date(msg.created_at).toLocaleTimeString([], {
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

      {/* Input area */}
      <div className="border-t px-4 py-3">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message…"
            className="flex-1 h-10 rounded-full border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
