import { beforeEach, vi } from 'vitest'
import { sendBulkEmail, sendEmail } from '@/lib/email'

// Every test here runs with no SMTP credentials, which is the configuration that
// used to fail silently: the point is that a caller can now tell nothing was
// delivered. Delivery over a real SMTP connection is covered in
// email-smtp.test.ts.
beforeEach(() => {
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASS
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('sendEmail', () => {
  test('reports that email is not configured instead of implying success', async () => {
    const result = await sendEmail({ to: 'a@x.com', subject: 'Hi', html: '<p>Hi</p>' })
    expect(result).toEqual({ sent: false, reason: 'not_configured' })
  })
})

describe('sendBulkEmail', () => {
  test('counts every recipient as undelivered when email is not configured', async () => {
    const result = await sendBulkEmail({
      recipients: ['a@x.com', 'b@x.com'],
      subject: 'News',
      html: '<p>News</p>',
    })
    expect(result).toMatchObject({
      recipients: 2,
      delivered: 0,
      failed: 2,
      notConfigured: true,
    })
  })

  test('deduplicates recipients, ignoring case and spacing', async () => {
    const result = await sendBulkEmail({
      recipients: ['A@x.com', 'a@x.com', '  a@X.com  ', 'b@x.com'],
      subject: 'News',
      html: '<p>News</p>',
    })
    // The same person listed under two profiles should get one copy, not two.
    expect(result.recipients).toBe(2)
  })

  test('drops blank addresses', async () => {
    const result = await sendBulkEmail({
      recipients: ['a@x.com', '', '   '],
      subject: 'News',
      html: '<p>News</p>',
    })
    expect(result.recipients).toBe(1)
  })

  test('an empty list is not treated as a failure', async () => {
    const result = await sendBulkEmail({ recipients: [], subject: 'News', html: '<p>x</p>' })
    expect(result).toEqual({
      recipients: 0,
      delivered: 0,
      failed: 0,
      notConfigured: false,
      errors: [],
    })
  })
})
