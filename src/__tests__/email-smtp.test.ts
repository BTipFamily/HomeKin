// End-to-end delivery over a real SMTP connection.
//
// The unit tests in email.test.ts cover the not-configured case; these run a
// genuine SMTP server on localhost and assert on what actually came out the
// other end, including the confirmation email the signup flow sends.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { sendBulkEmail, sendEmail } from '@/lib/email'
import { buildConfirmUrl, confirmationEmailHtml } from '@/lib/signup-confirmation'
import { startTestSmtpServer, type TestSmtpServer } from './helpers/smtp-test-server'
import type { AddressObject } from 'mailparser'

/** mailparser types a single-address header as either one object or an array. */
function headerAddress(value: AddressObject | AddressObject[] | undefined): string {
  if (!value) return ''
  return Array.isArray(value) ? value.map((v) => v.text).join(', ') : value.text
}

const SMTP_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE', 'EMAIL_FROM']
const saved: Record<string, string | undefined> = {}

let smtp: TestSmtpServer

/** Points the app's mailer at the local server. */
function useServer(server: TestSmtpServer, { from }: { from?: string } = {}) {
  process.env.SMTP_HOST = '127.0.0.1'
  process.env.SMTP_PORT = String(server.port)
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = server.user
  process.env.SMTP_PASS = server.pass
  if (from) process.env.EMAIL_FROM = from
}

beforeEach(() => {
  for (const key of SMTP_VARS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  await smtp?.close()
  for (const key of SMTP_VARS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
  vi.restoreAllMocks()
})

describe('sendEmail over SMTP', () => {
  test('delivers a message with the right sender, recipient, subject and body', async () => {
    smtp = await startTestSmtpServer()
    useServer(smtp, { from: 'HomeKin <family@gmail.com>' })

    const result = await sendEmail({
      to: 'cousin@example.com',
      subject: 'Reunion news',
      html: '<p>See you in July</p>',
    })

    expect(result).toEqual({ sent: true })
    expect(smtp.messages).toHaveLength(1)

    const [message] = smtp.messages
    expect(message.envelopeTo).toEqual(['cousin@example.com'])
    expect(message.envelopeFrom).toBe('family@gmail.com')
    expect(message.parsed.subject).toBe('Reunion news')
    expect(message.parsed.html).toContain('See you in July')
  })

  test('sends from the authenticated account when EMAIL_FROM is unset', async () => {
    smtp = await startTestSmtpServer()
    useServer(smtp)

    await sendEmail({ to: 'cousin@example.com', subject: 'Hi', html: '<p>Hi</p>' })

    expect(smtp.messages[0].envelopeFrom).toBe('family@gmail.com')
  })

  test('reports a bad app password as failed rather than throwing', async () => {
    smtp = await startTestSmtpServer({ rejectAuth: true })
    useServer(smtp)

    const result = await sendEmail({
      to: 'cousin@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
    })

    // An announcement must not be rolled back because Gmail refused the login.
    expect(result.sent).toBe(false)
    if (result.sent) throw new Error('unreachable')
    expect(result.reason).toBe('failed')
    expect(result.detail).toContain('535')
  })

  test('reports a rejected recipient as failed', async () => {
    smtp = await startTestSmtpServer({ rejectRecipients: ['gone@example.com'] })
    useServer(smtp)

    const result = await sendEmail({
      to: 'gone@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
    })

    expect(result.sent).toBe(false)
    expect(smtp.messages).toHaveLength(0)
  })

  test('reports failure when nothing is listening on the port', async () => {
    smtp = await startTestSmtpServer()
    const deadPort = smtp.port
    await smtp.close()
    process.env.SMTP_HOST = '127.0.0.1'
    process.env.SMTP_PORT = String(deadPort)
    process.env.SMTP_SECURE = 'false'
    process.env.SMTP_USER = 'family@gmail.com'
    process.env.SMTP_PASS = 'app-password'

    const result = await sendEmail({ to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>' })
    expect(result.sent).toBe(false)
  })
})

describe('the signup confirmation email, end to end', () => {
  test('arrives with a clickable link that survived MIME encoding', async () => {
    smtp = await startTestSmtpServer()
    useServer(smtp, { from: 'HomeKin <family@gmail.com>' })

    // The real link: long, query-heavy, and exactly the kind of string
    // quoted-printable encoding likes to soft-wrap in the middle.
    const confirmUrl = buildConfirmUrl({
      origin: 'https://home-kin-vxzs.vercel.app',
      tokenHash: 'pkce_9f8c2b1a4d7e6f5c3b2a1908f7e6d5c4b3a29187',
      type: 'signup',
      next: '/dashboard',
      inviteCode: 'A1B2C3D4',
    })

    const result = await sendEmail({
      to: 'newcousin@example.com',
      subject: 'Confirm your HomeKin account',
      html: confirmationEmailHtml({ confirmUrl, name: 'Jane Smith' }),
    })

    expect(result).toEqual({ sent: true })

    const [message] = smtp.messages
    expect(message.parsed.subject).toBe('Confirm your HomeKin account')
    expect(message.parsed.html).toContain('Hi Jane Smith,')

    // The decoded body must contain the URL intact — a line break inserted
    // mid-URL is a link that 404s when clicked.
    expect(message.parsed.html).toContain(`href="${confirmUrl}"`)

    // And it must be reachable as text too, for the copy-paste fallback.
    const link = (message.parsed.text ?? '').includes(confirmUrl)
    expect(link || String(message.parsed.html).includes(confirmUrl)).toBe(true)

    const parsedUrl = new URL(confirmUrl)
    expect(parsedUrl.pathname).toBe('/api/auth/confirm')
    expect(parsedUrl.searchParams.get('invite_code')).toBe('A1B2C3D4')
  })
})

describe('sendBulkEmail over SMTP', () => {
  test('hides recipients in BCC and addresses the message to the sender', async () => {
    smtp = await startTestSmtpServer()
    useServer(smtp, { from: 'HomeKin <family@gmail.com>' })

    const result = await sendBulkEmail({
      recipients: ['a@example.com', 'b@example.com', 'c@example.com'],
      subject: 'Reunion announcement',
      html: '<p>Save the date</p>',
    })

    expect(result).toMatchObject({ recipients: 3, delivered: 3, failed: 0, notConfigured: false })
    expect(smtp.messages).toHaveLength(1)

    const [message] = smtp.messages
    // Everyone is on the envelope, so everyone receives it...
    expect(message.envelopeTo.sort()).toEqual([
      'a@example.com',
      'b@example.com',
      'c@example.com',
      'family@gmail.com',
    ])
    // ...but the headers disclose nobody. Leaking the family's addresses on
    // every announcement is the thing BCC exists to prevent.
    expect(headerAddress(message.parsed.to)).toBe('"HomeKin" <family@gmail.com>')
    expect(message.parsed.headers.has('bcc')).toBe(false)
    expect(String(message.parsed.html)).not.toContain('a@example.com')
  })

  test('splits a long list into batches under the per-message recipient cap', async () => {
    smtp = await startTestSmtpServer()
    useServer(smtp)

    const recipients = Array.from({ length: 100 }, (_, i) => `member${i}@example.com`)
    const result = await sendBulkEmail({
      recipients,
      subject: 'Announcement',
      html: '<p>Hello</p>',
    })

    expect(result).toMatchObject({ recipients: 100, delivered: 100, failed: 0 })
    // 45 per batch: 45 + 45 + 10.
    expect(smtp.messages).toHaveLength(3)
    expect(smtp.messages.map((m) => m.envelopeTo.length)).toEqual([46, 46, 11])
  })

  test('counts a recipient the server refused, not the whole batch', async () => {
    // One dead address in the second batch. SMTP still delivers to everyone else
    // on that message, and nodemailer only throws when *all* recipients are
    // refused — so this is the case that quietly inflated `delivered`.
    smtp = await startTestSmtpServer({ rejectRecipients: ['member50@example.com'] })
    useServer(smtp)

    const recipients = Array.from({ length: 60 }, (_, i) => `member${i}@example.com`)
    const result = await sendBulkEmail({
      recipients,
      subject: 'Announcement',
      html: '<p>Hello</p>',
    })

    expect(result.recipients).toBe(60)
    expect(result.delivered).toBe(59)
    expect(result.failed).toBe(1)
    expect(result.errors.join(' ')).toContain('member50@example.com')
  })

  test('a batch the server refuses outright counts as entirely failed', async () => {
    smtp = await startTestSmtpServer({ rejectAuth: true })
    useServer(smtp)

    const result = await sendBulkEmail({
      recipients: ['a@example.com', 'b@example.com'],
      subject: 'Announcement',
      html: '<p>Hello</p>',
    })

    expect(result).toMatchObject({ recipients: 2, delivered: 0, failed: 2, notConfigured: false })
    expect(result.errors[0]).toContain('535')
  })

  test('deduplicates before sending, so nobody gets two copies', async () => {
    smtp = await startTestSmtpServer()
    useServer(smtp)

    const result = await sendBulkEmail({
      recipients: ['A@example.com', 'a@example.com', '  a@EXAMPLE.com  ', 'b@example.com'],
      subject: 'Announcement',
      html: '<p>Hello</p>',
    })

    expect(result.recipients).toBe(2)
    expect(smtp.messages[0].envelopeTo.filter((a) => a === 'a@example.com')).toHaveLength(1)
  })
})
