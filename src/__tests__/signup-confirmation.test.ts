import { afterEach, describe, expect, test } from 'vitest'
import {
  appOrigin,
  buildConfirmUrl,
  confirmationEmailHtml,
  explainAuthEmailError,
  isConfirmType,
  isObfuscatedExistingUser,
  safeNextPath,
} from '@/lib/signup-confirmation'

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
})

describe('appOrigin', () => {
  test('strips a trailing slash so links do not end up with a double slash', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://homekin.example.com/'
    expect(appOrigin()).toBe('https://homekin.example.com')
  })

  test('falls back to localhost when unset', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(appOrigin()).toBe('http://localhost:3000')
  })
})

describe('buildConfirmUrl', () => {
  test('points at our own confirm route, carrying the token and invite code', () => {
    const url = new URL(
      buildConfirmUrl({
        origin: 'https://homekin.example.com',
        tokenHash: 'abc123',
        type: 'signup',
        inviteCode: 'A1B2C3D4',
      })
    )

    expect(url.pathname).toBe('/api/auth/confirm')
    expect(url.searchParams.get('token_hash')).toBe('abc123')
    expect(url.searchParams.get('type')).toBe('signup')
    expect(url.searchParams.get('next')).toBe('/dashboard')
    // Without the code riding along, confirmation completes but the invite stays
    // redeemable forever.
    expect(url.searchParams.get('invite_code')).toBe('A1B2C3D4')
  })

  test('omits the invite code when there is none', () => {
    const url = new URL(
      buildConfirmUrl({ origin: 'https://x.test', tokenHash: 't', type: 'magiclink' })
    )
    expect(url.searchParams.has('invite_code')).toBe(false)
  })

  test('tolerates a trailing slash on the origin', () => {
    const url = buildConfirmUrl({ origin: 'https://x.test/', tokenHash: 't', type: 'signup' })
    expect(url.startsWith('https://x.test/api/auth/confirm?')).toBe(true)
  })
})

describe('safeNextPath', () => {
  test('keeps in-app paths', () => {
    expect(safeNextPath('/reunion/1/signups')).toBe('/reunion/1/signups')
  })

  test.each(['https://evil.test/phish', '//evil.test', 'evil.test', '', null])(
    'refuses to redirect off-site: %s',
    (value) => {
      expect(safeNextPath(value)).toBe('/dashboard')
    }
  )
})

describe('isConfirmType', () => {
  test('accepts the verification types we generate', () => {
    expect(isConfirmType('signup')).toBe(true)
    expect(isConfirmType('magiclink')).toBe(true)
  })

  test('rejects anything else, including recovery links', () => {
    expect(isConfirmType('recovery')).toBe(false)
    expect(isConfirmType(null)).toBe(false)
  })
})

describe('confirmationEmailHtml', () => {
  test('includes the link both as a button and as copyable text', () => {
    const html = confirmationEmailHtml({
      confirmUrl: 'https://homekin.example.com/api/auth/confirm?token_hash=t&type=signup',
      name: 'Jane Smith',
    })
    expect(html).toContain('href="https://homekin.example.com/api/auth/confirm?token_hash=t&type=signup"')
    expect(html.match(/api\/auth\/confirm/g)?.length).toBeGreaterThan(1)
    expect(html).toContain('Hi Jane Smith,')
  })

  test('escapes a name so it cannot inject markup into the email', () => {
    const html = confirmationEmailHtml({
      confirmUrl: 'https://x.test/c',
      name: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('greets without a name when none was given', () => {
    expect(confirmationEmailHtml({ confirmUrl: 'https://x.test/c', name: '  ' })).toContain('Hi,')
  })

  test('says it is a sign-in link when the account already existed', () => {
    const html = confirmationEmailHtml({
      confirmUrl: 'https://x.test/c',
      existingAccount: true,
    })
    expect(html).toContain('already has a HomeKin account')
  })
})

describe('explainAuthEmailError', () => {
  test('explains the built-in mailer rate limit, which is the usual culprit', () => {
    const explained = explainAuthEmailError('Email rate limit exceeded')
    expect(explained).toContain('rate-limiting')
    expect(explained).toContain('SMTP')
  })

  test('explains a send failure without dumping the raw message', () => {
    expect(explainAuthEmailError('Error sending confirmation email')).toContain(
      'confirmation email could not be sent'
    )
  })

  test('leaves messages it cannot improve on alone', () => {
    expect(explainAuthEmailError('Password should be at least 6 characters')).toBeNull()
  })
})

describe('isObfuscatedExistingUser', () => {
  test('spots the stub user Supabase returns for an address that already exists', () => {
    // This is the case that used to show "we sent a confirmation link" while
    // Supabase sent nothing at all.
    expect(isObfuscatedExistingUser({ identities: [] })).toBe(true)
  })

  test('a genuinely new user has an identity', () => {
    expect(isObfuscatedExistingUser({ identities: [{ id: 'x' }] })).toBe(false)
  })

  test('no user is not an existing user', () => {
    expect(isObfuscatedExistingUser(null)).toBe(false)
  })
})
