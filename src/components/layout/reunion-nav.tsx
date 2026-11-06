'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Check, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  MOBILE_TAB_PATHS,
  isActiveSection,
  reunionSections,
  sectionHref,
  type ReunionSection,
} from '@/lib/reunion-nav'

type ReunionNavProps = {
  reunionId: string
  reunionName: string
  canManage: boolean
  reunions: { id: string; name: string; year: number }[]
}

/**
 * The reunion's own sections, as a tab row under the top bar on desktop.
 *
 * Moved out of the top bar, where up to ten of them sat in one unwrapped row
 * beside the global links and crowded it at any width short of a large monitor.
 * Scrolls sideways rather than wrapping, and brings the current tab into view.
 */
export function ReunionTabs({ reunionId, canManage }: ReunionNavProps) {
  const pathname = usePathname()
  const sections = reunionSections(canManage)
  const activeRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  const firstPlanning = sections.findIndex((s) => s.group === 'planning')

  return (
    <nav
      aria-label="Reunion sections"
      className="sticky top-16 z-30 hidden border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:block"
    >
      {/* The fade on the right edge says there is more to scroll to — with the
          scrollbar hidden, a cut-off "Budget Estim" was the only hint. */}
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-1 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_calc(100%_-_2.5rem),transparent)] [scrollbar-width:none] sm:px-6 lg:px-8">
        {sections.map((section, i) => {
          const active = isActiveSection(pathname, reunionId, section.path)
          return (
            <Link
              key={section.path}
              ref={active ? activeRef : undefined}
              href={sectionHref(reunionId, section.path)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                // The committee's tools start after a divider, so the family's
                // sections read as one group and the organisers' as another.
                i === firstPlanning && 'ml-2 border-l pl-4 rounded-l-none',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {section.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/**
 * The phone's bottom tab bar: Overview, Events, Chat, Photos, and More.
 *
 * At the bottom because that is where a thumb is, and in the shape every
 * installed app on the phone already uses. "More" opens a sheet with the
 * remaining sections and the reunion switcher, which the phone otherwise had no
 * way to reach short of going back to the dashboard.
 */
export function ReunionBottomBar({ reunionId, reunionName, canManage, reunions }: ReunionNavProps) {
  const pathname = usePathname()
  // Remembers the page the sheet was opened on rather than a plain boolean, so
  // following any link — or the browser's back button — closes it by itself.
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const moreOpen = openedOn === pathname
  const setMoreOpen = (open: boolean) => setOpenedOn(open ? pathname : null)
  const sections = reunionSections(canManage)

  const tabs = MOBILE_TAB_PATHS.map((p) => sections.find((s) => s.path === p)).filter(
    (s): s is ReunionSection => Boolean(s)
  )
  const rest = sections.filter((s) => !(MOBILE_TAB_PATHS as readonly string[]).includes(s.path))
  const moreActive = rest.some((s) => isActiveSection(pathname, reunionId, s.path))

  const family = rest.filter((s) => s.group === 'family')
  const planning = rest.filter((s) => s.group === 'planning')

  return (
    <>
      <nav
        aria-label="Reunion sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      >
        <div className="grid h-16 grid-cols-5">
          {tabs.map(({ path, label, icon: Icon }) => {
            const active = isActiveSection(pathname, reunionId, path)
            return (
              <Link
                key={path}
                href={sectionHref(reunionId, path)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 text-xs font-medium',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(
              'flex flex-col items-center justify-center gap-1 text-xs font-medium',
              moreActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
            More
          </button>
        </div>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="bottom-0 left-0 top-auto max-h-[85dvh] max-w-none translate-x-0 translate-y-0 gap-5 overflow-y-auto rounded-t-2xl border-b-0 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0">
          <DialogTitle className="pr-8 text-base">{reunionName}</DialogTitle>

          <SheetGroup
            title="Your reunion"
            sections={family}
            reunionId={reunionId}
            pathname={pathname}
          />
          <SheetGroup
            title={canManage ? 'Committee tools' : 'Planning'}
            sections={planning}
            reunionId={reunionId}
            pathname={pathname}
          />

          {reunions.length > 1 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Switch reunion
              </h3>
              <ul className="mt-2 divide-y rounded-lg border">
                {reunions.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={sectionHref(r.id, '')}
                      aria-current={r.id === reunionId ? 'page' : undefined}
                      className="flex min-h-12 items-center justify-between gap-3 px-4 text-sm"
                    >
                      <span>
                        {r.name} <span className="text-muted-foreground">({r.year})</span>
                      </span>
                      {r.id === reunionId && <Check className="h-4 w-4 text-primary" aria-hidden />}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function SheetGroup({
  title,
  sections,
  reunionId,
  pathname,
}: {
  title: string
  sections: ReunionSection[]
  reunionId: string
  pathname: string
}) {
  if (sections.length === 0) return null
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {sections.map(({ path, label, icon: Icon }) => {
          const active = isActiveSection(pathname, reunionId, path)
          return (
            <Link
              key={path}
              href={sectionHref(reunionId, path)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border px-1 py-3 text-center text-xs font-medium',
                active ? 'border-primary/40 bg-primary/10 text-primary' : 'hover:bg-accent'
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
