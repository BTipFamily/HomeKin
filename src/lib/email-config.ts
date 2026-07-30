// SMTP settings, read once and in one place.
//
// Separate from `email.ts` because that file is a 'use server' module, whose
// exports must all be async functions — and because both the mailer and the
// signup action need to ask "can we send email at all?" before doing work.

export type SmtpConfig = {
  host: string
  port: number
  /** True for implicit TLS (port 465); false for STARTTLS (port 587). */
  secure: boolean
  user: string
  pass: string
  /** The `From` header. */
  from: string
}

const DEFAULT_HOST = 'smtp.gmail.com'
const DEFAULT_PORT = 587
/** Gmail's implicit-TLS port. Anything else is assumed to use STARTTLS. */
const IMPLICIT_TLS_PORT = 465

/**
 * The SMTP settings, or null when the app has no way to send email.
 *
 * `SMTP_USER` and `SMTP_PASS` are the two that cannot be guessed, so their
 * absence is what "not configured" means. Host and port default to Gmail.
 */
export function smtpConfig(): SmtpConfig | null {
  const user = (process.env.SMTP_USER ?? '').trim()
  const pass = process.env.SMTP_PASS ?? ''

  if (!user || !pass) return null

  const host = (process.env.SMTP_HOST ?? '').trim() || DEFAULT_HOST
  const parsedPort = parseInt(process.env.SMTP_PORT ?? '', 10)
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT

  // Gmail rejects — or silently rewrites — a `From` that is not the account
  // that authenticated, so the account address is the only safe default.
  const from = (process.env.EMAIL_FROM ?? '').trim() || user

  return { host, port, secure: isSecure(port), user, pass, from }
}

export function isEmailConfigured(): boolean {
  return smtpConfig() !== null
}

function isSecure(port: number): boolean {
  const explicit = (process.env.SMTP_SECURE ?? '').trim().toLowerCase()
  if (explicit === 'true') return true
  if (explicit === 'false') return false
  return port === IMPLICIT_TLS_PORT
}
