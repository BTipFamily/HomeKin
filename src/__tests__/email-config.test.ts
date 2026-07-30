import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { isEmailConfigured, smtpConfig } from '@/lib/email-config'

const SMTP_VARS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_SECURE',
  'EMAIL_FROM',
] as const

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of SMTP_VARS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of SMTP_VARS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe('smtpConfig', () => {
  test('is null without credentials, so callers can say email is not set up', () => {
    expect(smtpConfig()).toBeNull()
    expect(isEmailConfigured()).toBe(false)
  })

  test('is null with a user but no app password', () => {
    process.env.SMTP_USER = 'family@gmail.com'
    expect(smtpConfig()).toBeNull()
  })

  test('defaults to Gmail on the STARTTLS port', () => {
    process.env.SMTP_USER = 'family@gmail.com'
    // Not written in Gmail's "xxxx xxxx xxxx xxxx" app-password shape on
    // purpose: secret scanners flag that pattern as a live credential, and a
    // failing security check on every PR trains people to ignore them.
    process.env.SMTP_PASS = 'fake-not-a-real-secret'

    expect(smtpConfig()).toEqual({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      user: 'family@gmail.com',
      pass: 'fake-not-a-real-secret',
      from: 'family@gmail.com',
    })
    expect(isEmailConfigured()).toBe(true)
  })

  test('falls back to the authenticated account as the sender', () => {
    // Gmail rewrites or rejects a From it did not authenticate, so guessing a
    // noreply@ address here would break every send.
    process.env.SMTP_USER = 'family@gmail.com'
    process.env.SMTP_PASS = 'pw'
    expect(smtpConfig()?.from).toBe('family@gmail.com')
  })

  test('honours an explicit sender', () => {
    process.env.SMTP_USER = 'family@gmail.com'
    process.env.SMTP_PASS = 'pw'
    process.env.EMAIL_FROM = 'HomeKin <family@gmail.com>'
    expect(smtpConfig()?.from).toBe('HomeKin <family@gmail.com>')
  })

  test('turns on implicit TLS for port 465', () => {
    process.env.SMTP_USER = 'u'
    process.env.SMTP_PASS = 'p'
    process.env.SMTP_PORT = '465'
    expect(smtpConfig()).toMatchObject({ port: 465, secure: true })
  })

  test('SMTP_SECURE overrides what the port implies, in both directions', () => {
    process.env.SMTP_USER = 'u'
    process.env.SMTP_PASS = 'p'

    process.env.SMTP_PORT = '587'
    process.env.SMTP_SECURE = 'true'
    expect(smtpConfig()?.secure).toBe(true)

    process.env.SMTP_PORT = '465'
    process.env.SMTP_SECURE = 'false'
    expect(smtpConfig()?.secure).toBe(false)
  })

  test('ignores an unparseable port rather than dialling NaN', () => {
    process.env.SMTP_USER = 'u'
    process.env.SMTP_PASS = 'p'
    process.env.SMTP_PORT = 'not-a-port'
    expect(smtpConfig()?.port).toBe(587)
  })

  test('accepts another provider when host and port are given', () => {
    process.env.SMTP_USER = 'u'
    process.env.SMTP_PASS = 'p'
    process.env.SMTP_HOST = 'smtp.fastmail.com'
    process.env.SMTP_PORT = '465'
    expect(smtpConfig()).toMatchObject({ host: 'smtp.fastmail.com', port: 465, secure: true })
  })
})
