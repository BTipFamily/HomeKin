import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LEGAL_LAST_UPDATED, contactIsConfigured, legalContactEmail } from '@/lib/legal'

/**
 * The shell both legal pages share.
 *
 * Reachable without signing in, which is the whole point: App Store Connect
 * wants a privacy policy URL it can open, and a reviewer reads these before
 * making an account. Neither page sits under the (app) group for that reason.
 */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          HomeKin
        </Link>
      </Button>

      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Last updated {new Date(`${LEGAL_LAST_UPDATED}T00:00:00Z`).toLocaleDateString('en-US', {
          timeZone: 'UTC',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}
      </p>

      {!contactIsConfigured() && (
        <p className="mt-4 flex items-start gap-1.5 rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Not ready to publish.</strong> CONTACT_EMAIL is unset, so the
            contact address below is a placeholder. Set it before submitting to the App Store —
            a reviewer will write to it.
          </span>
        </p>
      )}

      <div className="mt-6 space-y-5 text-[15px] leading-relaxed">{children}</div>

      <p className="mt-10 border-t pt-5 text-sm text-muted-foreground">
        Questions about any of this go to{' '}
        <a className="underline" href={`mailto:${legalContactEmail()}`}>
          {legalContactEmail()}
        </a>
        .
      </p>
    </main>
  )
}

export function LegalHeading({ children }: { children: ReactNode }) {
  return <h2 className="pt-2 text-lg font-semibold">{children}</h2>
}
