// Proves the SMTP setup actually delivers, using your real credentials.
//
// Run this once after setting SMTP_USER and SMTP_PASS — a Gmail app password
// that has not been generated correctly fails here with 535 in a second, rather
// than silently a week later when someone tries to sign up.
//
// Usage: node scripts/send-test-email.mjs [recipient@example.com]
//        (defaults to sending to yourself)
//
// The message content is deliberately plain. What the real emails look like is
// covered by src/__tests__/email-smtp.test.ts; this script exists to test the
// connection, the credentials and the sending quota.

import { readFileSync } from 'node:fs'
import nodemailer from 'nodemailer'

function loadEnvLocal() {
  try {
    const content = readFileSync('.env.local', 'utf8')
    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z_]+)=(.*)\r?$/)
      // Prefer .env.local, in case a stale value was exported into this shell.
      if (match) process.env[match[1]] = match[2]
    }
  } catch {
    // ignore, rely on real env vars
  }
}

loadEnvLocal()

const user = (process.env.SMTP_USER ?? '').trim()
const pass = process.env.SMTP_PASS ?? ''

if (!user || !pass) {
  console.error('SMTP_USER and SMTP_PASS must be set (in .env.local or the environment).')
  console.error('SMTP_PASS is a Google app password, not your account password.')
  process.exit(1)
}

const host = (process.env.SMTP_HOST ?? '').trim() || 'smtp.gmail.com'
const port = Number.parseInt(process.env.SMTP_PORT ?? '', 10) || 587
const secureEnv = (process.env.SMTP_SECURE ?? '').trim().toLowerCase()
const secure = secureEnv === 'true' ? true : secureEnv === 'false' ? false : port === 465
const from = (process.env.EMAIL_FROM ?? '').trim() || user
const to = process.argv[2] ?? user

console.log(`Connecting to ${host}:${port} (secure: ${secure}) as ${user}...`)

const transport = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
})

try {
  await transport.verify()
  console.log('✓ Connection and credentials accepted.')

  const info = await transport.sendMail({
    from,
    to,
    subject: 'HomeKin SMTP test',
    html:
      '<p>If you are reading this, HomeKin can send email.</p>' +
      '<p>Invite codes, RSVP invitations, announcements and signup confirmation ' +
      'links all travel this same path.</p>',
  })

  console.log(`✓ Delivered to ${to} (message id ${info.messageId})`)
  if (info.rejected?.length) {
    // sendMail only throws when *every* recipient is refused.
    console.warn('⚠ Rejected:', info.rejected.join(', '))
  }
  console.log('\nCheck the inbox — and the spam folder, which is where a first')
  console.log('message from a new sender often lands.')
} catch (e) {
  console.error('\n✗ Failed:', e.message)
  if (/535|Username and Password not accepted/i.test(e.message)) {
    console.error('\nThat is Gmail refusing the login. Check that:')
    console.error('  - 2-step verification is on for this Google account')
    console.error('  - SMTP_PASS is a 16-character app password, not the account password')
    console.error('  - SMTP_USER is the full address, e.g. you@gmail.com')
  }
  if (/Daily user sending limit exceeded/i.test(e.message)) {
    console.error("\nThe account is over Gmail's 500-recipients-a-day quota.")
  }
  process.exitCode = 1
} finally {
  transport.close()
}
