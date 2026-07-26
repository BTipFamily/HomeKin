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

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'HomeKin <noreply@homekin.app>',
      to,
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
