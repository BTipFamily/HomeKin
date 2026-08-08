import { describe, it, expect } from 'vitest'
import { readdirSync } from 'fs'
import { join } from 'path'
import { GUIDES, getGuide, guidesBySection, neighbours } from '@/lib/guides/registry'
import { SECTIONS } from '@/lib/guides/types'

// The registry is hand-maintained: adding a guide means writing the module and
// remembering to list it. These tests cover the ways that goes wrong, which are
// all silent — a guide that exists but is unreachable, or two guides quietly
// fighting over one URL.

const CONTENT_DIR = join(process.cwd(), 'src/content/guides')

describe('guide registry', () => {
  it('has guides', () => {
    expect(GUIDES.length).toBeGreaterThan(0)
  })

  it('gives every guide a unique slug', () => {
    const slugs = GUIDES.map((g) => g.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('uses URL-safe slugs', () => {
    for (const guide of GUIDES) {
      expect(guide.slug, `${guide.title} has an unusable slug`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('matches each slug to its own filename', () => {
    // Otherwise the registry and the file tree drift and nobody can find the
    // module that backs a page.
    const files = new Set(
      readdirSync(CONTENT_DIR)
        .filter((f) => f.endsWith('.tsx'))
        .map((f) => f.replace(/\.tsx$/, ''))
    )
    for (const guide of GUIDES) {
      expect(files.has(guide.slug), `no module named ${guide.slug}.tsx`).toBe(true)
    }
  })

  it('leaves no guide module unregistered', () => {
    const registered = new Set(GUIDES.map((g) => g.slug))
    const orphans = readdirSync(CONTENT_DIR)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => f.replace(/\.tsx$/, ''))
      .filter((slug) => !registered.has(slug))

    expect(orphans, 'written but not listed in the registry, so unreachable').toEqual([])
  })

  it('puts every guide in a real section', () => {
    const ids = new Set(SECTIONS.map((s) => s.id))
    for (const guide of GUIDES) {
      expect(ids.has(guide.section), `${guide.slug} is in an unknown section`).toBe(true)
    }
  })

  it('gives every guide a title and a summary', () => {
    for (const guide of GUIDES) {
      expect(guide.title.trim().length).toBeGreaterThan(0)
      expect(guide.summary.trim().length).toBeGreaterThan(0)
      // The summary is the whole of the index card; a truncated one reads as a bug.
      expect(guide.summary.length, `${guide.slug} summary is very long`).toBeLessThan(140)
    }
  })

  it('exports a component for every guide', () => {
    for (const guide of GUIDES) {
      expect(typeof guide.Component, `${guide.slug} has no default export`).toBe('function')
    }
  })

  it('only uses roles that exist', () => {
    for (const guide of GUIDES) {
      if (guide.role) expect(['committee', 'admin']).toContain(guide.role)
    }
  })
})

describe('lookup helpers', () => {
  it('finds a guide by slug', () => {
    expect(getGuide(GUIDES[0].slug)?.title).toBe(GUIDES[0].title)
  })

  it('returns undefined for an unknown slug', () => {
    expect(getGuide('no-such-guide')).toBeUndefined()
  })

  it('accounts for every guide exactly once when grouping', () => {
    const grouped = guidesBySection().flatMap((s) => s.guides)
    expect(grouped).toHaveLength(GUIDES.length)
  })

  it('groups in section order and skips empty sections', () => {
    const order = guidesBySection().map((s) => s.id)
    const expected = SECTIONS.map((s) => s.id).filter((id) => GUIDES.some((g) => g.section === id))
    expect(order).toEqual(expected)
  })

  it('links neighbours without running off either end', () => {
    expect(neighbours(GUIDES[0].slug).previous).toBeUndefined()
    expect(neighbours(GUIDES[0].slug).next?.slug).toBe(GUIDES[1].slug)
    expect(neighbours(GUIDES[GUIDES.length - 1].slug).next).toBeUndefined()
  })

  it('returns nothing for the neighbours of an unknown slug', () => {
    expect(neighbours('no-such-guide')).toEqual({})
  })
})
