'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import {
  appOrigin,
  buildConfirmUrl,
  confirmationEmailHtml,
  type ConfirmType,
} from '@/lib/signup-confirmation'

// Deliberately permissive — matches the rule the invite and import paths use.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

export type SignupResult =
  /** The link is on its way through Resend. */
  | { status: 'sent'; email: string; existingAccount: boolean }
  /**
   * The project has email confirmation switched off, so the account came back
   * already confirmed and there is nothing to confirm — sign them straight in.
   */
  | { status: 'account_active' }
  /**
   * We cannot deliver it ourselves — no RESEND_API_KEY or no service-role key.
   * Checked before anything is created, so the caller can safely fall back to
   * Supabase's built-in mailer.
   */
  | { status: 'delivery_unavailable' }
  | { status: 'invalid_code'; reason: 'invalid' | 'used' | 'expired' }
  | { status: 'error'; message: string }

type SignupInput = {
  name: string
  email: string
  password: string
  phone?: string
  familyBranch?: string
  code: string
}

/** Whether HomeKin can send the confirmation email itself. */
function canDeliverOurselves(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY
}

/**
 * Creates the account and emails the confirmation link through Resend.
 *
 * Supabase's built-in sender is rate-limited to a handful of messages an hour
 * from a shared domain and reliably lands in spam, which is why confirmation
 * emails go missing. When Resend is configured we mint the link ourselves with
 * the admin API and send it down the same path as every other email this app
 * sends, so a failure is visible instead of silent.
 */
export async function startSignup(input: SignupInput): Promise<SignupResult> {
  const email = (input.email ?? '').trim().toLowerCase()
  const code = (input.code ?? '').trim().toUpperCase()
  const name = (input.name ?? '').trim()

  // The form checks these too; a server action is a public endpoint, so it
  // cannot take the form's word for it.
  if (!EMAIL_RE.test(email)) {
    return { status: 'error', message: `"${input.email}" is not a valid email address.` }
  }
  if ((input.password ?? '').length < MIN_PASSWORD_LENGTH) {
    return {
      status: 'error',
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    }
  }
  if (!code) return { status: 'invalid_code', reason: 'invalid' }

  if (!canDeliverOurselves()) return { status: 'delivery_unavailable' }

  const service: SupabaseClient = createServiceClient()

  const codeCheck = await checkInviteCode(service, code)
  if (codeCheck !== 'valid') return { status: 'invalid_code', reason: codeCheck }

  const metadata = {
    name,
    phone: input.phone?.trim() || null,
    family_branch: input.familyBranch?.trim() || null,
    invite_code: code,
  }

  const link = await generateSignupLink(service, {
    email,
    password: input.password,
    metadata,
  })

  if ('error' in link) return { status: 'error', message: link.error }
  if (link.alreadyConfirmed) return { status: 'account_active' }

  const confirmUrl = buildConfirmUrl({
    origin: appOrigin(),
    tokenHash: link.tokenHash,
    type: link.type,
    next: '/dashboard',
    inviteCode: code,
  })

  const result = await sendEmail({
    to: email,
    subject: link.existingAccount ? 'Your HomeKin sign-in link' : 'Confirm your HomeKin account',
    html: confirmationEmailHtml({
      confirmUrl,
      name,
      existingAccount: link.existingAccount,
    }),
  })

  if (result.sent) return { status: 'sent', email, existingAccount: link.existingAccount }

  // The account exists at this point, so say plainly that the link did not go
  // out rather than parking them on a "check your inbox" screen forever.
  return {
    status: 'error',
    message:
      result.reason === 'not_configured'
        ? 'Your account was created, but email is not set up yet, so no confirmation link was sent. Ask an admin to finish the email setup.'
        : `Your account was created, but the confirmation email could not be sent${
            result.detail ? ` — ${result.detail}` : ''
          }. Try the resend link, or ask an admin to check the email setup.`,
  }
}

export type ResendResult =
  | { status: 'sent' }
  | { status: 'delivery_unavailable' }
  | { status: 'error'; message: string }

/**
 * Sends a fresh link to someone whose first one never arrived.
 *
 * A magic link rather than a new signup link: the password is long gone by the
 * time this runs, and verifying a magic link confirms the address just the same.
 */
export async function resendConfirmation({
  email: rawEmail,
  code: rawCode,
}: {
  email: string
  code?: string
}): Promise<ResendResult> {
  const email = (rawEmail ?? '').trim().toLowerCase()
  const code = (rawCode ?? '').trim().toUpperCase()

  if (!EMAIL_RE.test(email)) {
    return { status: 'error', message: 'That does not look like a valid email address.' }
  }
  if (!canDeliverOurselves()) return { status: 'delivery_unavailable' }

  const service: SupabaseClient = createServiceClient()

  const { data, error } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${appOrigin()}/dashboard` },
  })

  const tokenHash = data?.properties?.hashed_token
  if (error || !tokenHash) {
    return {
      status: 'error',
      message: error?.message ?? 'Could not generate a new link. Try again in a moment.',
    }
  }

  const confirmUrl = buildConfirmUrl({
    origin: appOrigin(),
    tokenHash,
    type: 'magiclink',
    next: '/dashboard',
    inviteCode: code || null,
  })

  const result = await sendEmail({
    to: email,
    subject: 'Your HomeKin sign-in link',
    html: confirmationEmailHtml({
      confirmUrl,
      name: (data?.user?.user_metadata as { name?: string } | undefined)?.name ?? null,
      existingAccount: true,
    }),
  })

  if (result.sent) return { status: 'sent' }
  return {
    status: 'error',
    message:
      result.reason === 'not_configured'
        ? 'Email is not set up yet, so nothing could be sent.'
        : `The email could not be sent${result.detail ? ` — ${result.detail}` : ''}.`,
  }
}

type SupabaseLike = SupabaseClient

async function checkInviteCode(
  service: SupabaseLike,
  code: string
): Promise<'valid' | 'invalid' | 'used' | 'expired'> {
  const { data, error } = await service
    .from('invite_codes')
    .select('id, used_at, expires_at')
    .eq('code', code)
    .maybeSingle()

  if (error || !data) return 'invalid'
  if (data.used_at) return 'used'
  if (data.expires_at && new Date(data.expires_at) < new Date()) return 'expired'
  return 'valid'
}

type GeneratedLink =
  | {
      tokenHash: string
      type: ConfirmType
      existingAccount: boolean
      /** True when the project auto-confirms, so no email is needed at all. */
      alreadyConfirmed: boolean
    }
  | { error: string }

/**
 * Mints the one-time token for the email.
 *
 * `generateLink` creates the account for us. An address that already has one
 * comes back as an error, and rather than dead-ending there we fall through to
 * a magic link: someone who signed up, never got the email and tried again is
 * the most likely person in that branch, and they cannot sign in to ask for a
 * new one.
 */
async function generateSignupLink(
  service: SupabaseLike,
  {
    email,
    password,
    metadata,
  }: { email: string; password: string; metadata: Record<string, unknown> }
): Promise<GeneratedLink> {
  const { data, error } = await service.auth.admin.generateLink({
    type: 'signup',
    email,
    password,
    options: { data: metadata, redirectTo: `${appOrigin()}/dashboard` },
  })

  const tokenHash = data?.properties?.hashed_token
  if (!error && tokenHash) {
    return {
      tokenHash,
      type: 'signup',
      existingAccount: false,
      alreadyConfirmed: !!data?.user?.email_confirmed_at,
    }
  }

  if (error && !isAlreadyRegistered(error.message)) {
    return { error: error.message }
  }

  const existing = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${appOrigin()}/dashboard` },
  })

  const existingHash = existing.data?.properties?.hashed_token
  if (existing.error || !existingHash) {
    return {
      error:
        existing.error?.message ??
        'That address already has an account, but a sign-in link could not be generated. Try signing in instead.',
    }
  }

  return {
    tokenHash: existingHash,
    type: 'magiclink',
    existingAccount: true,
    alreadyConfirmed: false,
  }
}

function isAlreadyRegistered(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('already registered') ||
    m.includes('already been registered') ||
    m.includes('email_exists') ||
    m.includes('already exists')
  )
}
