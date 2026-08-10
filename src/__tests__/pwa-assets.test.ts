import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import manifest from '@/app/manifest'

// The icons and the manifest, checked against the rules that are only enforced
// at upload time otherwise.
//
// Every PNG here is generated from public/brand/homekin-mark.svg by
// `npm run icons`. These assertions read the committed files, so they fail if
// somebody edits a PNG by hand, regenerates from a broken source, or deletes one
// — all of which surface as an App Store rejection days later, or as a blank
// square on somebody's home screen.

const root = process.cwd()
const file = (p: string) => join(root, p)

/**
 * Reads a PNG header directly.
 *
 * No image library: the two facts that matter — the dimensions and whether there
 * is an alpha channel — sit at fixed offsets in the IHDR chunk, which is always
 * the first chunk. Depending on sharp here would mean the test passes on a
 * machine that cannot build sharp and fails on one that can.
 */
function readPng(path: string): { width: number; height: number; hasAlpha: boolean } {
  const buf = readFileSync(path)

  const signature = buf.subarray(0, 8)
  expect(
    signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    `${path} is not a PNG`
  ).toBe(true)

  // IHDR: length(4) type(4) width(4) height(4) bitDepth(1) colourType(1)
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const colourType = buf.readUInt8(25)

  // Colour types 4 (grey+alpha) and 6 (RGB+alpha) carry an alpha channel.
  return { width, height, hasAlpha: colourType === 4 || colourType === 6 }
}

const ICONS: { path: string; size: number }[] = [
  { path: 'src/app/icon.png', size: 512 },
  { path: 'src/app/apple-icon.png', size: 180 },
  { path: 'public/icons/icon-192.png', size: 192 },
  { path: 'public/icons/icon-512.png', size: 512 },
  { path: 'public/icons/icon-192-maskable.png', size: 192 },
  { path: 'public/icons/icon-512-maskable.png', size: 512 },
  { path: 'public/icons/app-store-1024.png', size: 1024 },
]

describe('the icon set', () => {
  it('has a source mark to regenerate from', () => {
    expect(existsSync(file('public/brand/homekin-mark.svg'))).toBe(true)
    expect(existsSync(file('scripts/generate-icons.mjs'))).toBe(true)
  })

  for (const { path, size } of ICONS) {
    it(`${path} is ${size}×${size} and square`, () => {
      expect(existsSync(file(path)), `${path} is missing — run \`npm run icons\``).toBe(true)
      const png = readPng(file(path))
      expect(png.width).toBe(size)
      expect(png.height).toBe(size)
    })

    it(`${path} has no alpha channel`, () => {
      // Apple's validator rejects an App Store icon with transparency, and it
      // does so at upload — after the archive, after the wait. Every icon is
      // flattened rather than only the 1024, because the same mark feeds them
      // all and one exception is how the exception gets forgotten.
      expect(readPng(file(path)).hasAlpha, `${path} carries an alpha channel`).toBe(false)
    })
  }

  it('keeps the App Store icon a reasonable size', () => {
    // Not a rule, a smell: a 1024 icon in the megabytes usually means the mark
    // stopped being flat colour and became a photograph.
    expect(statSync(file('public/icons/app-store-1024.png')).size).toBeLessThan(400_000)
  })
})

describe('the manifest', () => {
  const m = manifest()

  it('names the app as it should read under a home-screen icon', () => {
    expect(m.short_name).toBe('HomeKin')
    expect((m.short_name ?? '').length).toBeLessThanOrEqual(12)
  })

  it('starts at / rather than a route that redirects when signed out', () => {
    // /dashboard bounces to /login for a signed-out visitor, so a freshly
    // installed app's very first act would be a redirect.
    expect(m.start_url).toBe('/')
  })

  it('runs without browser chrome', () => {
    expect(m.display).toBe('standalone')
  })

  it('does not lock orientation, so an iPad in landscape is usable', () => {
    expect(m.orientation).toBeUndefined()
  })

  it('declares separate maskable icons rather than reusing the plain ones', () => {
    const icons = m.icons ?? []
    const maskable = icons.filter((i) => i.purpose === 'maskable')
    const plain = icons.filter((i) => i.purpose === 'any')

    expect(maskable.length).toBeGreaterThan(0)
    expect(plain.length).toBeGreaterThan(0)

    // Sharing a file between the two is the mistake: a launcher crops a maskable
    // icon to the middle 80%, so the plain artwork loses its roof.
    for (const one of maskable) {
      expect(plain.map((p) => p.src)).not.toContain(one.src)
    }
  })

  it('points every icon at a file that exists', () => {
    for (const icon of m.icons ?? []) {
      const src = String(icon.src)
      expect(existsSync(file(join('public', src))), `${src} is declared but missing`).toBe(true)
    }
  })

  it('uses the app palette for the splash and the title bar', () => {
    expect(m.background_color).toBe('#fbf2ea')
    expect(m.theme_color).toBe('#8a4924')
  })
})

describe('the service worker', () => {
  const sw = readFileSync(file('public/sw.js'), 'utf8')

  it('never caches a navigation response', () => {
    // The rule the whole worker is built around. This app holds addresses,
    // birthdays, photographs of children and health notes; page HTML must not
    // end up in a cache on a device that might be shared or lost.
    expect(sw).toContain("request.mode === 'navigate'")
    const navigationBlock = sw.slice(sw.indexOf("request.mode === 'navigate'"))
    const beforeNextHandler = navigationBlock.slice(0, navigationBlock.indexOf('isBuildAsset'))
    expect(beforeNextHandler).not.toContain('cache.put')
  })

  it('leaves anything that is not a GET alone', () => {
    // Server Actions, sign-ins and payments. A replayed POST could take money
    // twice.
    expect(sw).toContain("request.method !== 'GET'")
  })

  it('never touches /api', () => {
    expect(sw).toContain("url.pathname.startsWith('/api/')")
  })

  it('drops old caches on activate, so a deploy cannot serve a stale build', () => {
    expect(sw).toContain('caches.delete')
  })

  it('precaches the offline page', () => {
    expect(sw).toContain("const OFFLINE_URL = '/offline'")
  })
})
