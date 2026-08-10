import Link from 'next/link'
import { CalendarHeart, GitBranch, ShieldCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * The public front door.
 *
 * Deliberately static — it reads no cookies, so it prerenders and a first-time
 * visitor gets it instantly. Signed-in visitors never see it: the middleware
 * already resolves the session on every path and sends them to /dashboard from
 * there (see src/proxy.ts), which keeps the auth check off this page.
 */

export const metadata = {
  title: 'HomeKin — keep the whole family in one place',
  description:
    "HomeKin holds your family's directory, its tree and every moving part of a reunion.",
}

const FEATURES = [
  {
    icon: Users,
    title: 'A directory that respects privacy',
    body: 'Everyone chooses who sees their phone, address, email and birthday — enforced when the data is read, not just hidden in the interface.',
  },
  {
    icon: GitBranch,
    title: 'A family tree that draws itself',
    body: 'Record parents, children and partners once. The tree follows, with the kind of each link kept intact.',
  },
  {
    icon: CalendarHeart,
    title: 'Reunions, start to finish',
    body: "From the first 'would you come?' through planning, events, signups and money — each stage leads with what it needs from you.",
  },
  {
    icon: ShieldCheck,
    title: 'Invite only',
    body: 'Nobody wanders in. An admin or committee member issues a code, and signing up with it claims the profile already waiting for you.',
  },
]

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sage">
        For extended families
      </p>

      <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
        Keep the whole family in one place — and get the reunion planned.
      </h1>

      <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
        HomeKin holds your family&apos;s directory, its tree and every moving part of a reunion:
        who&apos;s interested, what&apos;s happening, who&apos;s coming and who still owes what.
      </p>

      <Button asChild size="lg" className="mt-10 h-12 rounded-full px-8 text-base">
        <Link href="/login">Sign in or join with a code</Link>
      </Button>

      <div className="mt-20 grid gap-5 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="border-border/70">
            <CardContent className="p-7">
              <Icon className="h-6 w-6 text-primary" strokeWidth={1.75} aria-hidden />
              <h2 className="mt-6 text-xl font-semibold tracking-tight">{title}</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Reachable without an account on purpose: App Store Connect needs a
          privacy policy URL it can open, and a reviewer reads both of these
          before signing up for anything. */}
      <footer className="mt-20 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-8 text-sm text-muted-foreground">
        <Link className="hover:text-foreground" href="/terms">
          Terms of Use
        </Link>
        <Link className="hover:text-foreground" href="/privacy">
          Privacy Policy
        </Link>
      </footer>
    </main>
  )
}
