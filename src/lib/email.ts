'use server'

// Thin email wrapper — stubs to console when RESEND_API_KEY is not set
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[Email stub] to:', to, 'subject:', subject)
    return
  }
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'HomeKin <noreply@homekin.app>',
    to,
    subject,
    html,
  })
}
