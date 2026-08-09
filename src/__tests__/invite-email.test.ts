import { describe, it, expect } from 'vitest'
import {
  clampExpiryDays,
  describeSendFailure,
  expiryDate,
  inviteEmailHtml,
  inviteEmailSubject,
  INVITE_EXPIRY_DAYS,
  signupUrlFor,
  toDateString,
} from '@/lib/invite-email'

const BASE = {
  signupUrl: 'https://homekin.example/signup?code=ABCD2345',
  inviterName: 'Rose Carter',
  expiresOn: '2026-03-01',
}

describe('inviteEmailSubject', () => {
  it('names the inviter', () => {
    expect(inviteEmailSubject('Rose Carter')).toBe(
      'Rose Carter invited you to the family directory'
    )
  })
})

describe('inviteEmailHtml', () => {
  it('puts the signup link in the button and in copyable text', () => {
    const html = inviteEmailHtml(BASE)
    expect(html).toContain(`href="${BASE.signupUrl}"`)
    expect(html).toContain('Set up my account')
    // The link also appears as text, for clients that strip the button.
    expect(html).toContain('word-break:break-all;">https://homekin.example/signup?code=ABCD2345<')
  })

  it('greets a known recipient by name, and falls back when there is none', () => {
    expect(inviteEmailHtml({ ...BASE, recipientName: 'Jane Smith' })).toContain('Hi Jane Smith,')
    expect(inviteEmailHtml(BASE)).toContain('Hi,')
    expect(inviteEmailHtml({ ...BASE, recipientName: '   ' })).toContain('Hi,')
  })

  it('escapes the inviter name rather than emitting it as markup', () => {
    const html = inviteEmailHtml({
      ...BASE,
      inviterName: 'Ann <script>alert(1)</script> & Co',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp; Co')
  })

  it('escapes the recipient name too', () => {
    const html = inviteEmailHtml({ ...BASE, recipientName: "O'Brien <b>" })
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('renders the expiry as a plain date that does not shift by timezone', () => {
    const html = inviteEmailHtml(BASE)
    expect(html).toContain('expires on March 1, 2026')
    expect(html).not.toContain('February 28')
  })

  it('says the invite is single-use', () => {
    expect(inviteEmailHtml(BASE)).toContain('can only be used once')
  })
})

describe('signupUrlFor', () => {
  it('builds the link and strips a trailing slash from the origin', () => {
    expect(signupUrlFor('https://homekin.example/', 'ABCD2345')).toBe(
      'https://homekin.example/signup?code=ABCD2345'
    )
    expect(signupUrlFor('https://homekin.example', 'ABCD2345')).toBe(
      'https://homekin.example/signup?code=ABCD2345'
    )
  })
})

describe('expiryDate', () => {
  it('adds the given number of days', () => {
    const from = new Date('2026-03-01T12:00:00Z')
    expect(toDateString(expiryDate(30, from))).toBe('2026-03-31')
  })

  it('rolls over a month boundary', () => {
    const from = new Date('2026-12-20T12:00:00Z')
    expect(toDateString(expiryDate(30, from))).toBe('2027-01-19')
  })
})

describe('clampExpiryDays', () => {
  it('keeps a value inside the allowed range', () => {
    expect(clampExpiryDays('14')).toBe(14)
    expect(clampExpiryDays('1')).toBe(1)
    expect(clampExpiryDays('365')).toBe(365)
  })

  it('clamps out-of-range values instead of rejecting them', () => {
    expect(clampExpiryDays('0')).toBe(1)
    expect(clampExpiryDays('-5')).toBe(1)
    expect(clampExpiryDays('999')).toBe(365)
  })

  it('falls back to the default when the field is blank or unparseable', () => {
    expect(clampExpiryDays('')).toBe(INVITE_EXPIRY_DAYS)
    expect(clampExpiryDays(null)).toBe(INVITE_EXPIRY_DAYS)
    expect(clampExpiryDays(undefined)).toBe(INVITE_EXPIRY_DAYS)
    expect(clampExpiryDays('abc')).toBe(INVITE_EXPIRY_DAYS)
  })
})

describe('describeSendFailure', () => {
  it('names the missing settings when email is not set up', () => {
    expect(describeSendFailure('not_configured')).toContain('SMTP_USER')
  })

  it('passes the provider detail through when there is one', () => {
    expect(describeSendFailure('failed', 'mailbox full')).toBe(
      'the email provider rejected it — mailbox full'
    )
    expect(describeSendFailure('failed')).toBe('the email provider rejected it')
  })
})
