import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Which routes a signed-out stranger can reach.
//
// src/proxy.ts redirects everything that is not on its public list to /login.
// That is the right default, and it caught three pages that must not be behind
// it:
//
//   /privacy  — App Store Connect stores it as a URL and opens it with no
//               session. Behind the redirect it resolves to a login form, which
//               to a reviewer is a broken privacy policy link.
//   /terms    — same, and guideline 1.2 requires published terms for an app
//               carrying user content.
//   /goodbye  — reached the instant after somebody deletes their own account,
//               when the session has just been destroyed on purpose. It arrives
//               with no user every single time, so off the list it would ALWAYS
//               bounce to /login and the last thing anybody saw on their way out
//               would be a sign-in form.
//
// Asserted at source rather than by booting the app, because the failure is a
// missing line in a boolean, and this runs in milliseconds.

const PROXY = readFileSync(join(process.cwd(), 'src/proxy.ts'), 'utf8')

const MUST_BE_PUBLIC = [
  { path: '/terms', why: 'guideline 1.2 requires published terms, readable by anyone' },
  { path: '/privacy', why: 'App Store Connect opens the privacy policy URL with no session' },
  { path: '/goodbye', why: 'it is reached after the session has been deliberately destroyed' },
]

describe('routes a signed-out stranger must be able to open', () => {
  for (const { path, why } of MUST_BE_PUBLIC) {
    it(`${path} is public — ${why}`, () => {
      const listed = new RegExp(`pathname\\.startsWith\\(['"]${path}['"]\\)`).test(PROXY)
      expect(
        listed,
        `${path} is missing from isPublicPath in src/proxy.ts, so a signed-out visitor is ` +
          `redirected to /login. ${why}.`
      ).toBe(true)
    })
  }

  it('still redirects a private route', () => {
    // The guard only means something if the default is still "sign in first".
    expect(/pathname\.startsWith\(['"]\/dashboard['"]\)/.test(PROXY)).toBe(false)
    expect(/pathname\.startsWith\(['"]\/directory['"]\)/.test(PROXY)).toBe(false)
    expect(/pathname\.startsWith\(['"]\/account['"]\)/.test(PROXY)).toBe(false)
  })

  it('keeps the redirect for anything not on the list', () => {
    expect(PROXY).toContain('if (!user && !isPublicPath)')
  })
})
