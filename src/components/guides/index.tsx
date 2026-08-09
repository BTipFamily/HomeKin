import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * The building blocks every guide is made of.
 *
 * All server components — no hooks, no state. That is what lets the guide pages
 * prerender: they read nothing and do nothing, they are just words and pictures.
 */

/**
 * A picture of a screen, drawn from the real components rather than captured.
 *
 * The frame matters as much as the contents. Without it a replica made of real
 * Buttons and Inputs looks like a form the reader should fill in, and someone
 * will try. The title bar says "this is a picture", and `pointer-events-none`
 * plus `inert` make sure it behaves like one — nothing inside is focusable,
 * clickable, or reachable by tab.
 */
export function Screen({
  label,
  caption,
  children,
  className,
}: {
  /** The screen or panel this depicts, e.g. "Add Event". */
  label: string
  caption?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <figure className="my-6">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div
          className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2"
          aria-hidden="true"
        >
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
          </span>
          <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
        </div>

        {/* Wide replicas scroll inside their own frame; the page never moves. */}
        <div className="overflow-x-auto">
          {/* @ts-expect-error `inert` lands in React's types after this React version. */}
          <div inert="" className={cn('pointer-events-none min-w-[22rem] select-none p-4', className)}>
            {children}
          </div>
        </div>
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs text-muted-foreground">{caption}</figcaption>
      )}
    </figure>
  )
}

/** The numbered dot that ties a step to a spot on the replica. */
export function Marker({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground',
        className
      )}
    >
      {n}
    </span>
  )
}

/** One numbered step: what to do, and optionally a picture of where. */
export function Step({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: ReactNode
}) {
  return (
    <section className="relative border-l border-border pb-8 pl-8 last:pb-0">
      <span className="absolute -left-[13px] top-0 flex h-[26px] w-[26px] items-center justify-center rounded-full border-4 border-background bg-primary text-xs font-bold text-primary-foreground">
        {n}
      </span>
      <h3 className="mt-0 text-lg font-semibold leading-tight">{title}</h3>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

/** Wraps the steps so the connecting rail lines up. */
export function Steps({ children }: { children: ReactNode }) {
  return <div className="my-6">{children}</div>
}

const NOTE_STYLES = {
  tip: 'border-success-border bg-success-surface text-success-foreground',
  warning: 'border-warning-border bg-warning-surface text-warning-foreground',
  heads_up: 'border-border bg-muted text-foreground',
} as const

const NOTE_LABELS = {
  tip: 'Tip',
  warning: 'Careful',
  heads_up: 'Worth knowing',
} as const

/**
 * A short aside. `warning` is for the things that cannot be taken back once
 * done — money leaving somebody's hands, email going out to the whole family,
 * and anything that destroys what other people wrote or owed.
 */
export function GuideNote({
  variant = 'heads_up',
  title,
  children,
}: {
  variant?: keyof typeof NOTE_STYLES
  title?: string
  children: ReactNode
}) {
  return (
    <div className={cn('my-5 rounded-lg border p-4 text-[15px] leading-relaxed', NOTE_STYLES[variant])}>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide opacity-80">
        {title ?? NOTE_LABELS[variant]}
      </p>
      {children}
    </div>
  )
}

/**
 * What a task needs, not what the reader is.
 *
 * Kept separate from `components/role-badge.tsx` on purpose: that one labels a
 * person, this one labels a job. Every guide is readable by everyone — knowing
 * how the committee settles a date is useful even if you can't do it — so this
 * explains an absent button rather than hiding the page.
 */
export function RequiresRole({ role }: { role: 'committee' | 'admin' }) {
  return (
    <Badge
      className={cn(
        'border-transparent',
        role === 'admin'
          ? 'bg-primary text-primary-foreground'
          : 'bg-violet-600 text-white dark:bg-violet-400 dark:text-violet-950'
      )}
    >
      {role === 'admin' ? 'Admin only' : 'Committee or admin'}
    </Badge>
  )
}

/** Prose paragraph inside a guide. Keeps measure and rhythm consistent. */
export function P({ children }: { children: ReactNode }) {
  return <p className="my-4 text-[15px] leading-relaxed text-muted-foreground">{children}</p>
}

/** A bulleted list with the same rhythm as `P`. */
export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="my-4 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted-foreground">
      {children}
    </ul>
  )
}

/** A sub-heading within a longer guide. */
export function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 mb-1 text-xl font-semibold tracking-tight">{children}</h2>
}

/** Names a control exactly as it is labelled on screen. */
export function UI({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">{children}</span>
  )
}
