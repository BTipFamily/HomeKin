'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'

/**
 * What people see when something on the server throws.
 *
 * Without this file Next renders its own bare "a server error occurred", which
 * gives nobody anything to go on — not the person who hit it, and not whoever
 * has to work out why. React strips the real message out of production builds
 * on purpose (it can contain anything the server knows), but it does hand over
 * a `digest`, and that digest appears next to the stack trace in the hosting
 * logs. Showing it turns "it broke" into a line somebody can search for.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[HomeKin] Unhandled error:', error)
  }, [error])

  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Something went wrong
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This page didn&apos;t load. It is not something you did wrong — try again, and
            if it keeps happening, send whoever looks after HomeKin the reference below.
          </p>

          {/*
            In development the real message survives, and it is the fastest way
            to see what actually threw. In production it is React's placeholder,
            so the digest underneath is the part that matters.
          */}
          {error.message && (
            <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-words">
              {error.message}
            </p>
          )}

          {error.digest && (
            <p className="text-xs text-muted-foreground">
              Reference: <span className="font-mono">{error.digest}</span>
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
