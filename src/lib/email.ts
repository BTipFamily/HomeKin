'use server'

/** Why an email did not go out, so callers can say so instead of implying success. */
export type EmailResult =
  | { sent: true }
  | { sent: false; reason: 'not_configured' | 'failed'; detail?: string }

/**
 * Thin Resend wrapper.
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
  if (!process.env.RESEND_API_KEY) {
    console.log('[Email stub] to:', to, 'subject:', subject)
    return { sent: false, reason: 'not_configured' }
  }

  return deliver({ to, subject, html })
}

/** Resend caps recipients per request; stay under it with room to spare. */
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

  const from = process.env.EMAIL_FROM ?? 'HomeKin <noreply@homekin.app>'

  if (!process.env.RESEND_API_KEY) {
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

  for (let i = 0; i < unique.length; i += BCC_BATCH_SIZE) {
    const batch = unique.slice(i, i + BCC_BATCH_SIZE)
    const result = await deliver({ to: from, bcc: batch, subject, html })
    if (result.sent) {
      delivered += batch.length
    } else {
      failed += batch.length
      if (result.reason === 'failed' && result.detail) errors.push(result.detail)
    }
  }

  return { recipients: unique.length, delivered, failed, notConfigured: false, errors }
}

async function deliver({
  to,
  bcc,
  subject,
  html,
}: {
  to: string
  bcc?: string[]
  subject: string
  html: string
}): Promise<EmailResult> {
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'HomeKin <noreply@homekin.app>',
      to,
      ...(bcc && bcc.length > 0 ? { bcc } : {}),
      subject,
      html,
    })
    if (error) {
      console.error('[Email] Resend rejected the message:', error.message)
      return { sent: false, reason: 'failed', detail: error.message }
    }
    return { sent: true }
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'Unknown error'
    console.error('[Email] Failed to send:', detail)
    return { sent: false, reason: 'failed', detail }
  }
}
