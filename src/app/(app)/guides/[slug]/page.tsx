import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RequiresRole } from '@/components/guides'
import { GUIDES, getGuide, neighbours } from '@/lib/guides/registry'
import { SECTIONS } from '@/lib/guides/types'
import { ArrowLeft, ArrowRight } from 'lucide-react'

type Props = { params: Promise<{ slug: string }> }

/**
 * Note this does not make the pages static: the `(app)` layout reads the
 * session to gate on auth, which makes everything beneath it dynamic — the
 * dashboard and directory render the same way. It is kept because it declares
 * the valid slugs in one place and costs nothing; the guides fetch no data, so
 * a dynamic render here is still just markup.
 */
export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const guide = getGuide(slug)
  if (!guide) return {}
  return { title: `${guide.title} — HomeKin Guides`, description: guide.summary }
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params
  const guide = getGuide(slug)
  if (!guide) notFound()

  const section = SECTIONS.find((s) => s.id === guide.section)
  const { previous, next } = neighbours(slug)
  const { Component } = guide

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2">
        <Link href="/guides">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          All guides
        </Link>
      </Button>

      <header className="mb-8">
        {section && (
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-sage">
            {section.title}
          </p>
        )}
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{guide.title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{guide.summary}</p>
        {guide.role && (
          <div className="mt-4">
            <RequiresRole role={guide.role} />
          </div>
        )}
      </header>

      <article>
        <Component />
      </article>

      <nav className="mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2">
        {previous ? (
          <Link
            href={`/guides/${previous.slug}`}
            className="group rounded-lg border p-4 transition-colors hover:bg-accent"
          >
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowLeft className="h-3 w-3" /> Previous
            </span>
            <span className="mt-1 block text-sm font-medium">{previous.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={`/guides/${next.slug}`}
            className="group rounded-lg border p-4 text-right transition-colors hover:bg-accent sm:col-start-2"
          >
            <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
              Next <ArrowRight className="h-3 w-3" />
            </span>
            <span className="mt-1 block text-sm font-medium">{next.title}</span>
          </Link>
        )}
      </nav>
    </div>
  )
}
