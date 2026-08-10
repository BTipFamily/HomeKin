import type { Metadata } from 'next'
import { WifiOff } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Offline — HomeKin',
}

/**
 * What the service worker shows when a navigation cannot reach the server.
 *
 * Contains nothing about anybody, on purpose. It is the one page precached to
 * the device, and this app holds addresses, birthdays, photographs of children
 * and health notes — none of which belongs in a cache on a phone that might be
 * shared or lost. A generic page is the whole reason it is safe to have one.
 *
 * No reload button that calls router.refresh(): the router needs the network to
 * do anything, so it would look broken. A plain link reloads the document, which
 * is what actually works the moment signal comes back.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <WifiOff className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />

        <h1 className="text-2xl font-bold">No connection</h1>

        <p className="mt-3 text-muted-foreground">
          HomeKin keeps the directory, the photographs and the money on the server, so it needs a
          connection to show you any of it. Reunion venues are famous for having none — try again
          when you have a bar or two.
        </p>

        <a
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </a>
      </div>
    </main>
  )
}
