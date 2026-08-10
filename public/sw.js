// HomeKin's service worker.
//
// Deliberately the most cautious version of this that is still useful, because
// of what the app holds: addresses, birthdays, photographs of children, and
// dietary, health and mobility notes. A cache is a file on a device that may be
// shared, may be lost, and is not covered by anybody's row-level security.
//
// So the rule is: **no page HTML is ever cached.** Navigations go to the network
// and, if the network is not there, fall back to a single offline page that
// contains nothing about anybody. Nothing personal is written to disk here that
// was not already in the browser's own HTTP cache.
//
// What is cached is the shell — the build's own JavaScript and CSS, the icons,
// the offline page. Those are identical for everyone, immutable (Next puts a
// content hash in every filename under /_next/static), and they are what makes
// the difference between a cold start on hotel wifi and a spinner.
//
// A reunion venue is exactly where signal fails, which is the whole reason this
// exists rather than being left for later.

const VERSION = 'homekin-v1'
const SHELL = `${VERSION}-shell`
const OFFLINE_URL = '/offline'

// Enough to render the offline page and the icon beside it, and nothing else.
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      // Individually rather than addAll: addAll rejects the whole install if any
      // single request 404s, and a service worker that will not install is
      // harder to notice than one asset missing from a cache.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }))
          } catch {
            // Left uncached. The fetch handler copes.
          }
        })
      )
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache from an older VERSION. Without this a stale shell
      // survives a deploy and serves last week's JavaScript against this week's
      // server actions, which fails in ways nobody can reproduce.
      const names = await caches.keys()
      await Promise.all(
        names.filter((name) => !name.startsWith(VERSION)).map((name) => caches.delete(name))
      )
      await self.clients.claim()
    })()
  )
})

/** Immutable build output: content-hashed, so a cache hit can never be stale. */
function isBuildAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')
}

/** Our own icons and the mark. Small, stable, and needed before anything renders. */
function isIcon(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/brand/'))
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Anything that is not a plain GET is a Server Action, a sign-in, a payment or
  // an upload. None of it is cacheable and none of it should be retried from
  // here — a replayed POST could take a payment twice.
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Third-party requests — Supabase, Stripe, Mapbox — are left entirely alone.
  if (url.origin !== self.location.origin) return

  // Auth callbacks, API routes and webhooks must always hit the server.
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request)
        } catch {
          // Offline. Not a cached copy of the page they asked for — that page
          // is somebody's directory — but a page that says so.
          const cached = await caches.match(OFFLINE_URL)
          return (
            cached ??
            new Response('You are offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          )
        }
      })()
    )
    return
  }

  if (isBuildAsset(url) || isIcon(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached) return cached

        const response = await fetch(request)
        // Only store a clean 200. An opaque or partial response cached here
        // would be served forever with no way to tell it is broken.
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(SHELL)
          cache.put(request, response.clone())
        }
        return response
      })()
    )
  }

  // Everything else — photographs from Supabase storage, page data — falls
  // through to the browser's own handling, uncached.
})
