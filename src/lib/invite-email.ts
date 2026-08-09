// The invite email — the pure parts.
//
// Kept out of the server action so the markup can be tested without a Supabase
// project or a mail server, matching the other *-email modules here. Moving it
// onto the shared shell in email-layout.ts also settled two things the old
// inline copy got wrong: every value interpolated into this email is
// user-supplied (an admin's name, and now the recipient's), and the expiry date
// has to read the same to the person opening it as it does to the admin who set
// it.

import { button, emailShell, escapeHtml, formatDate, note } from '@/lib/email-layout'

/**
 * How long an invite stays valid. Matches the default on /admin/invite, so a
 * code issued from a member's row behaves no differently from one typed by hand.
 */
export const INVITE_EXPIRY_DAYS = 30

const MIN_EXPIRY_DAYS = 1
const MAX_EXPIRY_DAYS = 365

export type InviteEmailInput = {
  signupUrl: string
  /** The admin doing the inviting. */
  inviterName: string
  /** 'YYYY-MM-DD'. A date rather than a timestamp — see `expiryDate` below. */
  expiresOn: string
  /** Greets them by name when the invite is aimed at a member we know. */
  recipientName?: string | null
}

export function inviteEmailSubject(inviterName: string): string {
  return `${inviterName} invited you to the family directory`
}

export function inviteEmailHtml(input: InviteEmailInput): string {
  const greeting = input.recipientName?.trim()
    ? `Hi ${escapeHtml(input.recipientName.trim())},`
    : 'Hi,'

  const expires = escapeHtml(formatDate(input.expiresOn))

  // `note` inserts its argument raw so callers can embed a <br>, so anything
  // interpolated into one has to be escaped here.
  const body = `
    <p style="font-size:15px;line-height:1.5;margin:0 0 16px;">${greeting}</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 16px;">
      ${escapeHtml(input.inviterName)} has invited you to HomeKin, where the family keeps its
      directory, reunion plans and photos in one place.
    </p>
    <p style="font-size:15px;line-height:1.5;margin:0;">
      Click below to set up your account. You&rsquo;ll pick your own password.
    </p>
    ${button(input.signupUrl, 'Set up my account')}
    ${note(
      `If the button doesn&rsquo;t work, copy this link into your browser:<br>` +
        `<span style="word-break:break-all;">${escapeHtml(input.signupUrl)}</span>`
    )}
    ${note(`This invitation can only be used once and expires on ${expires}.`)}
  `

  return emailShell({
    // Escaped by emailShell, so this one stays a plain apostrophe.
    title: "You're invited to join the family directory",
    preheader: `Set up your HomeKin account. This link expires on ${formatDate(input.expiresOn)}.`,
    body,
  })
}

/**
 * The signup link for a code.
 *
 * Built from our own origin rather than anything on the request, for the same
 * reason `appOrigin` exists in signup-confirmation.ts: the address in an email
 * sent to a stranger is the one a stranger must not get to choose.
 */
export function signupUrlFor(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/signup?code=${encodeURIComponent(code)}`
}

/**
 * The expiry as 'YYYY-MM-DD', which is what `formatDate` renders without
 * shifting a day. Stamping a timestamp and formatting it later is how a code
 * that expires on the 1st gets announced as expiring on February 28 to anyone
 * west of UTC.
 */
export function expiryDate(days: number, from: Date = new Date()): Date {
  const expires = new Date(from)
  expires.setDate(expires.getDate() + days)
  return expires
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * The /admin/invite form's expiry rule, extracted so it can be tested and so
 * both callers agree. Anything unparseable falls back to the default rather
 * than erroring — the field is optional.
 */
export function clampExpiryDays(raw: string | null | undefined): number {
  const parsed = parseInt((raw ?? '').trim() || String(INVITE_EXPIRY_DAYS), 10)
  if (!Number.isFinite(parsed)) return INVITE_EXPIRY_DAYS
  return Math.min(Math.max(parsed, MIN_EXPIRY_DAYS), MAX_EXPIRY_DAYS)
}

/**
 * Why an invite email did not go out, phrased for an admin who now has to do
 * something about it. Shared so the members table and /admin/invite explain the
 * same failure the same way.
 */
export function describeSendFailure(reason: 'not_configured' | 'failed', detail?: string): string {
  return reason === 'not_configured'
    ? 'email is not set up yet (SMTP_USER and SMTP_PASS are missing)'
    : `the email provider rejected it${detail ? ` — ${detail}` : ''}`
}
