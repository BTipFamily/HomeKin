'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker, once, after the page is usable.
 *
 * Deliberately not on mount: registration and the install-time precache compete
 * with the first render for bandwidth on exactly the connection that made a
 * service worker seem worth having. `load` is late enough that nothing the
 * person is waiting for is behind it.
 *
 * Development is excluded. Next serves modules unhashed with `next dev`, and a
 * worker holding those between reloads is the classic "why is my change not
 * showing" afternoon.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    function register() {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration costs nothing — the app works without it, which
        // is the point of doing it this way round. Nothing to tell anybody.
      })
    }

    if (document.readyState === 'complete') {
      register()
      return
    }

    window.addEventListener('load', register)
    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
