// The signup confirmation email — the pure parts.
//
// Kept out of the server action so they can be tested without a Supabase
// project: an action module marked 'use server' may only export async
// functions, and these are neither async nor worth mocking a network for.

import { escapeHtml } from '@/lib/email-layout'

/** Verification types we are willing to hand to `verifyOtp`. */
export const CONFIRM_TYPES = ['signup', 'magiclink', 'email'] as const
export type ConfirmType = (typeof CONFIRM_TYPES)[number]

export function isConfirmType(value: string | null | undefined): value is ConfirmType {
  return CONFIRM_TYPES.includes((value ?? '') as ConfirmType)
}

/**
 * The app's own origin, with any trailing slash removed.
 *
 * Confirmation links must not be built from a browser-supplied origin: the
 * address in the email is the one thing a stranger cannot be allowed to point
 * at a host of their choosing. Mirrors what invite codes already do.
 */
export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

/**
 * Builds the link that goes in the email.
 *
 * Deliberately not Supabase's `action_link`. That URL hits Supabase's `/verify`
 * endpoint, which hands the session back in a URL fragment the server never
 * sees, so the invite code and the member provisioning behind
 * `/api/auth/callback` are both lost. Sending the hashed token to our own route
 * instead keeps confirmation on the server, where it can claim the directory
 * profile and redeem the code in the same request.
 */
export function buildConfirmUrl({
  origin,
  tokenHash,
  type,
  next = '/dashboard',
  inviteCode,
}: {
  origin: string
  tokenHash: string
  type: ConfirmType
  next?: string
  inviteCode?: string | null
}): string {
  const params = new URLSearchParams({ token_hash: tokenHash, type, next })
  if (inviteCode) params.set('invite_code', inviteCode)
  return `${origin.replace(/\/$/, '')}/api/auth/confirm?${params.toString()}`
}

/** Only ever redirect within this app — `next` arrives on a public URL. */
export function safeNextPath(next: string | null | undefined): string {
  const value = next ?? ''
  if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard'
  return value
}

export function confirmationEmailHtml({
  confirmUrl,
  name,
  existingAccount = false,
}: {
  confirmUrl: string
  name?: string | null
  existingAccount?: boolean
}): string {
  const greeting = name?.trim() ? `Hi ${escapeHtml(name.trim())},` : 'Hi,'
  const lead = existingAccount
    ? 'That address already has a HomeKin account. Use the link below to sign in — no password needed.'
    : 'Confirm your email address to finish setting up your HomeKin account.'
  const buttonLabel = existingAccount ? 'Sign me in' : 'Confirm my email'

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111;">
      <h1 style="font-size:20px;margin:0 0 16px;">${existingAccount ? 'Your sign-in link' : 'Confirm your email'}</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 16px;">${greeting}</p>
      <p style="font-size:15px;line-height:1.5;margin:0 0 24px;">${lead}</p>
      <p style="margin:0 0 24px;">
        <a href="${confirmUrl}"
           style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;font-size:15px;">
          ${buttonLabel}
        </a>
      </p>
      <p style="font-size:13px;color:#666;line-height:1.5;margin:0 0 8px;">
        If the button doesn't work, copy this link into your browser:<br>
        <span style="word-break:break-all;">${confirmUrl}</span>
      </p>
      <p style="font-size:13px;color:#666;line-height:1.5;margin:0;">
        The link can only be used once and expires within 24 hours. If you didn't
        try to join HomeKin, you can ignore this email.
      </p>
    </div>
  `
}

/**
 * Turns a Supabase Auth error into something a person can act on.
 *
 * The raw messages leak implementation ("Error sending confirmation email") or
 * read as our fault when they are a project setting, and the built-in mailer's
 * rate limit is the single most common reason a confirmation email never turns
 * up. Returns null when the message is already clear enough to show as-is.
 */
export function explainAuthEmailError(message: string): string | null {
  const m = message.toLowerCase()

  if (m.includes('rate limit') || m.includes('too many requests')) {
    return (
      'Your account was not created: the email provider is rate-limiting us right ' +
      'now. Wait a few minutes and try again, or ask an admin to set up custom SMTP ' +
      'in Supabase so this stops happening.'
    )
  }
  if (m.includes('sending') && m.includes('email')) {
    return (
      'Your account was created but the confirmation email could not be sent. ' +
      'Ask an admin to check the email setup — until then, no link will arrive.'
    )
  }
  return null
}

/**
 * Whether Supabase quietly declined to email an existing address.
 *
 * With email confirmation on, signing up with an address that already exists
 * returns a stub user with no identities and sends nothing — so treating "no
 * session" as "we sent a link" tells people to check an inbox that will stay
 * empty.
 */
export function isObfuscatedExistingUser(user: {
  identities?: unknown[] | null
} | null): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0
}
