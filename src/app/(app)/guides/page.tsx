import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { RequiresRole } from '@/components/guides'
import { guidesBySection } from '@/lib/guides/registry'
import { ArrowRight } from 'lucide-react'

export const metadata = {
  title: 'Guides — HomeKin',
  description: 'How to do everything in HomeKin, one step at a time.',
}

/**
 * The guide index.
 *
 * Reads nothing, so it prerenders. Every guide is listed for everybody — the
 * badges explain why a button might be missing rather than hiding the page,
 * because knowing how the committee runs the reunion is useful even if you
 * aren't on it.
 */
export default function GuidesIndexPage() {
  const sections = guidesBySection()

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Guides</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          How to do everything in HomeKin, one step at a time. Nothing here changes anything —
          read as much as you like before you try it for real.
        </p>
      </header>

      <nav className="space-y-12">
        {sections.map((section) => (
          <section key={section.id}>
            <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{section.blurb}</p>

            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {section.guides.map((guide) => (
                <li key={guide.slug}>
                  <Link href={`/guides/${guide.slug}`} className="group block h-full">
                    <Card className="h-full transition-shadow hover:shadow-md">
                      <CardContent className="flex h-full flex-col p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-base font-semibold leading-snug">{guide.title}</h3>
                          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </div>
                        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                          {guide.summary}
                        </p>
                        {guide.role && (
                          <div className="mt-3">
                            <RequiresRole role={guide.role} />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
    </div>
  )
}
