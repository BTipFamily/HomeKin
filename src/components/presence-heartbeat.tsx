'use client'

import { useEffect } from 'react'
import { HEARTBEAT_INTERVAL_MS } from '@/lib/presence'

/**
 * Keeps the signed-in member's last_seen_at fresh while a tab is open.
 *
 * Pauses while the tab is hidden — a backgrounded tab is not somebody being
 * around — and beats immediately on return so they reappear in the roster
 * without waiting out the interval.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    let cancelled = false

    const beat = () => {
      if (cancelled || document.visibilityState !== 'visible') return
      // Failure is not worth surfacing: the next beat corrects it.
      void fetch('/api/presence', { method: 'POST' }).catch(() => {})
    }

    beat()
    const interval = setInterval(beat, HEARTBEAT_INTERVAL_MS)
    document.addEventListener('visibilitychange', beat)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [])

  return null
}
