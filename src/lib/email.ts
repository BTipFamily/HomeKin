'use server'

import type { Transporter } from 'nodemailer'
import { smtpConfig, type SmtpConfig } from '@/lib/email-config'

/** Why an email did not go out, so callers can say so instead of implying success. */
export type EmailResult =
  | { sent: true }
  | { sent: false; reason: 'not_configured' | 'failed'; detail?: string }

/**
 * Thin SMTP wrapper, pointed at Gmail by default.
 *
 * Gmail rather than a transactional provider because sending from a free
 * address is only legitimate through the provider that owns it: Gmail, Yahoo
 * and Microsoft all reject or spam-file a `@gmail.com` sender relayed by a
 * third party, since gmail.com cannot be SPF/DKIM-aligned for anyone else.
 * Going through smtp.gmail.com keeps the family's own address as the sender
 * with no domain to buy. The cost is Gmail's quota — 500 recipients a day —
 * which is ample here but is the thing that will eventually force a domain.
 *
 * Returns a result rather than throwing: a failed announcement email should not
 * roll back the announcement. Callers are expected to surface `sent: false` —
 * silently reporting success while nothing was delivered is how you find out
 * weeks later that nobody was ever invited.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}): Promise<EmailResult> {
  const config = smtpConfig()

  if (!config) {
    console.log('[Email stub] to:', to, 'subject:', subject)
    return { sent: false, reason: 'not_configured' }
  }

  const transport = await createTransport(config)
  try {
    const outcome = await deliver(transport, config, { to, subject, html })

    if (!outcome.sent) return outcome
    // The server took the message but refused the only recipient on it, which is
    // not something to report as sent.
    if (outcome.rejected.length > 0) {
      return { sent: false, reason: 'failed', detail: `${to} was rejected by the mail server` }
    }
    return { sent: true }
  } finally {
    transport.close()
  }
}

/**
 * Recipients per message.
 *
 * Gmail counts every To/Cc/Bcc address against both the per-message recipient
 * cap (100 on a free account) and the 500-a-day quota, so stay well under the
 * former with room to spare.
 */
const BCC_BATCH_SIZE = 45

export type BulkEmailResult = {
  recipients: number
  delivered: number
  failed: number
  notConfigured: boolean
  errors: string[]
}

/**
 * Sends one message to many people.
 *
 * Recipients go in BCC — a family directory's addresses are not something to
 * disclose to the whole family on every announcement — with the visible `to`
 * set to the sending address, which is what mail providers expect for a list.
 */
export async function sendBulkEmail({
  recipients,
  subject,
  html,
}: {
  recipients: string[]
  subject: string
  html: string
}): Promise<BulkEmailResult> {
  const unique = [...new Set(recipients.map((r) => r.trim().toLowerCase()).filter(Boolean))]

  if (unique.length === 0) {
    return { recipients: 0, delivered: 0, failed: 0, notConfigured: false, errors: [] }
  }

  const config = smtpConfig()

  if (!config) {
    console.log('[Email stub] bulk to', unique.length, 'recipients, subject:', subject)
    return {
      recipients: unique.length,
      delivered: 0,
      failed: unique.length,
      notConfigured: true,
      errors: [],
    }
  }

  let delivered = 0
  let failed = 0
  const errors: string[] = []

  // One connection for every batch: Gmail is quick to throttle a client that
  // opens a fresh session per message.
  const transport = await createTransport(config)

  try {
    for (let i = 0; i < unique.length; i += BCC_BATCH_SIZE) {
      const batch = unique.slice(i, i + BCC_BATCH_SIZE)
      const result = await deliver(transport, config, {
        to: config.from,
        bcc: batch,
        subject,
        html,
      })

      if (!result.sent) {
        failed += batch.length
        if (result.detail) errors.push(result.detail)
        continue
      }

      // A batch can succeed for most of its recipients and still have some
      // refused at RCPT TO — a retired address, a typo in the directory. SMTP
      // delivers to everyone else regardless, so count the refusals rather than
      // rounding the whole batch to success.
      const refused = result.rejected.filter((address) => batch.includes(address))
      delivered += batch.length - refused.length
      failed += refused.length
      if (refused.length > 0) errors.push(`Rejected by the mail server: ${refused.join(', ')}`)
    }
  } finally {
    transport.close()
  }

  return { recipients: unique.length, delivered, failed, notConfigured: false, errors }
}

async function createTransport(config: SmtpConfig): Promise<Transporter> {
  const nodemailer = await import('nodemailer')
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  })
}

/**
 * One SMTP transaction.
 *
 * `rejected` matters: nodemailer only throws when *every* recipient is refused,
 * so a partial refusal looks like plain success unless you read it.
 */
type DeliveryOutcome =
  | { sent: true; rejected: string[] }
  | { sent: false; reason: 'failed'; detail?: string }

async function deliver(
  transport: Transporter,
  config: SmtpConfig,
  {
    to,
    bcc,
    subject,
    html,
  }: {
    to: string
    bcc?: string[]
    subject: string
    html: string
  }
): Promise<DeliveryOutcome> {
  try {
    const info = await transport.sendMail({
      from: config.from,
      to,
      ...(bcc && bcc.length > 0 ? { bcc } : {}),
      subject,
      html,
    })
    return { sent: true, rejected: (info.rejected ?? []).map(addressOf) }
  } catch (e) {
    // Gmail's failures are worth reading rather than swallowing: a wrong app
    // password comes back as 535, and a blown quota as 550 with
    // "Daily user sending limit exceeded".
    const detail = e instanceof Error ? e.message : 'Unknown error'
    console.error('[Email] Failed to send:', detail)
    return { sent: false, reason: 'failed', detail }
  }
}

/** nodemailer reports addresses as either a bare string or an object. */
function addressOf(entry: string | { address: string }): string {
  return typeof entry === 'string' ? entry : entry.address
}

// ---------------------------------------------------------------------------
// Resend — disabled in favour of Gmail SMTP above.
//
// Kept because it is the better answer the moment this app has a domain of its
// own: no daily quota to speak of, proper bounce handling, and a `From` that is
// not somebody's personal mailbox. To switch back, restore `deliver` and
// `createTransport` to the version below, swap the `smtpConfig()` guards in
// `sendEmail`/`sendBulkEmail` for `process.env.RESEND_API_KEY`, and set
// RESEND_API_KEY plus an EMAIL_FROM on a domain verified in Resend.
//
// async function deliverViaResend({
//   to,
//   bcc,
//   subject,
//   html,
// }: {
//   to: string
//   bcc?: string[]
//   subject: string
//   html: string
// }): Promise<EmailResult> {
//   try {
//     const { Resend } = await import('resend')
//     const resend = new Resend(process.env.RESEND_API_KEY)
//     const { error } = await resend.emails.send({
//       from: process.env.EMAIL_FROM ?? 'HomeKin <noreply@homekin.app>',
//       to,
//       ...(bcc && bcc.length > 0 ? { bcc } : {}),
//       subject,
//       html,
//     })
//     if (error) {
//       console.error('[Email] Resend rejected the message:', error.message)
//       return { sent: false, reason: 'failed', detail: error.message }
//     }
//     return { sent: true }
//   } catch (e) {
//     const detail = e instanceof Error ? e.message : 'Unknown error'
//     console.error('[Email] Failed to send:', detail)
//     return { sent: false, reason: 'failed', detail }
//   }
// }
