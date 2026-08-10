// Rasterises public/brand/homekin-mark.svg into every icon the app needs.
//
// Run with `npm run icons` after editing the mark. The PNGs are committed —
// a build should not need sharp, and a missing icon is an App Store rejection
// rather than a broken image — but they are all generated, never hand-edited.
//
// Two rules Apple enforces that are easy to get wrong, so they are enforced here
// instead:
//
//   * The 1024 App Store icon must have NO alpha channel. A transparent pixel
//     anywhere fails validation at upload, long after you thought you were done.
//     `.flatten()` paints the cream behind it and `removeAlpha()` drops the
//     channel entirely.
//   * The App Store icon must have square corners. iOS applies the rounded mask
//     itself; supplying one already rounded gives you a dark halo on the home
//     screen. The mark is a full-bleed square for exactly this reason.
//
// Maskable icons are a separate pair rather than the same file re-declared.
// Android crops a maskable icon to whatever shape the launcher wants, keeping
// only the middle 80%, so the artwork has to be inset before it is declared —
// declaring the ordinary icon as maskable is how you get a house with its roof
// sliced off.

import sharp from 'sharp'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'public/brand/homekin-mark.svg')
const svg = readFileSync(source)

/** --background, the cream. What sits behind the mark wherever alpha is dropped. */
const CREAM = { r: 0xfb, g: 0xf2, b: 0xea, alpha: 1 }

const out = (...parts) => join(root, ...parts)

function ensure(path) {
  mkdirSync(dirname(path), { recursive: true })
  return path
}

async function png(size, path, { maskable = false, opaque = true } = {}) {
  // A maskable icon keeps its artwork inside the middle 80%: the launcher may
  // crop to a circle, a squircle or a teardrop, and only that centre is safe.
  const artwork = maskable ? Math.round(size * 0.8) : size
  const pad = Math.round((size - artwork) / 2)

  let image = sharp(svg, { density: 512 }).resize(artwork, artwork)

  if (maskable) {
    image = image.extend({
      top: pad,
      bottom: size - artwork - pad,
      left: pad,
      right: size - artwork - pad,
      // Extended with rust rather than cream so the padding is invisible: the
      // mark's own background is rust, and a cream border would read as a frame.
      background: { r: 0x8a, g: 0x49, b: 0x24, alpha: 1 },
    })
  }

  if (opaque) image = image.flatten({ background: CREAM }).removeAlpha()

  await image.png({ compressionLevel: 9 }).toFile(ensure(path))
  return path
}

const targets = [
  // Next picks these up by filename and writes the <link> tags itself — see
  // the app-icons file convention. No manual <head> markup anywhere.
  ['src/app/icon.png', 512, {}],
  ['src/app/apple-icon.png', 180, {}],

  // Declared in app/manifest.ts.
  ['public/icons/icon-192.png', 192, {}],
  ['public/icons/icon-512.png', 512, {}],
  ['public/icons/icon-192-maskable.png', 192, { maskable: true }],
  ['public/icons/icon-512-maskable.png', 512, { maskable: true }],

  // Uploaded to App Store Connect. Square corners, no alpha.
  ['public/icons/app-store-1024.png', 1024, {}],
]

const written = []
for (const [path, size, opts] of targets) {
  written.push(await png(size, out(path), opts))
}

// The favicon.
//
// sharp cannot write .ico, and rather than add a dependency for one 32-pixel
// file the container is assembled here: an ICO is a six-byte header, one
// sixteen-byte directory entry, and the image. Since Vista that image may be a
// PNG rather than a BMP, which is what makes this three lines instead of thirty.
//
// It has to be a real .ico because Next's `favicon.ico` convention only picks up
// that filename from app/, and without it the tab keeps whatever was there
// before — which for a project scaffolded from create-next-app is the Next.js
// mark, sitting in the browser tab of somebody's family directory.
// Flattened onto the cream but with the alpha channel KEPT, unlike every other
// icon here. Turbopack decodes the .ico at build time to work out its `sizes`
// attribute and refuses a PNG that is not RGBA — "Format error decoding Ico:
// The PNG is not in RGBA format!", which reads like a corrupt file and is
// really just a missing channel. Every pixel is opaque either way; Apple's
// no-alpha rule is about the App Store icon, not about favicons.
const favicon = await sharp(svg, { density: 512 })
  .resize(32, 32)
  .flatten({ background: CREAM })
  .ensureAlpha()
  .png({ compressionLevel: 9 })
  .toBuffer()

writeFileSync(ensure(out('public/icons/favicon-32.png')), favicon)

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // 1 = icon
header.writeUInt16LE(1, 4) // one image

const entry = Buffer.alloc(16)
entry.writeUInt8(32, 0) // width
entry.writeUInt8(32, 1) // height
entry.writeUInt8(0, 2) // palette size, 0 = truecolour
entry.writeUInt8(0, 3) // reserved
entry.writeUInt16LE(1, 4) // colour planes
entry.writeUInt16LE(32, 6) // bits per pixel
entry.writeUInt32LE(favicon.length, 8)
entry.writeUInt32LE(header.length + entry.length, 12) // offset to the image

writeFileSync(ensure(out('src/app/favicon.ico')), Buffer.concat([header, entry, favicon]))

// Proof rather than trust: re-read what was written and fail loudly if any of
// Apple's two rules was broken. A silent alpha channel is discovered at upload.
for (const path of written) {
  const meta = await sharp(path).metadata()
  if (meta.hasAlpha) throw new Error(`${path} still has an alpha channel`)
  if (meta.width !== meta.height) throw new Error(`${path} is not square`)
}

console.log(`Wrote ${written.length + 1} icons from ${source.replace(root + '/', '')}`)
for (const path of [...written, out('public/icons/favicon-32.png')]) {
  const meta = await sharp(path).metadata()
  console.log(`  ${path.replace(root + '/', '').padEnd(38)} ${meta.width}×${meta.height}`)
}
