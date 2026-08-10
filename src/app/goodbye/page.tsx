import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

/**
 * The last screen somebody sees.
 *
 * Outside the (app) group on purpose: the account and its login are both gone by
 * the time this renders, so anything under that layout would bounce to /login —
 * and a login form is the worst possible confirmation that deleting your account
 * worked. It reads as an error.
 */
export default async function GoodbyePage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; warning?: string }>
}) {
  const { name, warning } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-success-foreground" />

        <h1 className="text-2xl font-bold">
          {name ? `Goodbye, ${name}.` : 'Your account has been deleted.'}
        </h1>

        <p className="mt-3 text-muted-foreground">
          Your profile and everything belonging to it have been removed from the family directory.
          Your login no longer exists, and nothing is kept for an admin to restore.
        </p>

        {warning && (
          <p className="mt-4 flex items-start gap-1.5 rounded-lg border border-warning-border bg-warning-surface p-3 text-left text-sm text-warning-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {warning}
          </p>
        )}

        <p className="mt-4 text-sm text-muted-foreground">
          If you change your mind, somebody in the family can invite you again — you would start
          with a fresh profile.
        </p>

        <Button asChild className="mt-6">
          <Link href="/">Back to the start</Link>
        </Button>
      </div>
    </main>
  )
}
