'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { isEmailConfigured } from '@/lib/email-config'
import { normalizeEmail } from '@/lib/member-linking'
import { appOrigin } from '@/lib/signup-confirmation'
import {
  clampExpiryDays,
  describeSendFailure,
  expiryDate,
  inviteEmailHtml,
  inviteEmailSubject,
  INVITE_EXPIRY_DAYS,
  signupUrlFor,
  toDateString,
} from '@/lib/invite-email'

/**
 * Ambiguous characters (0/O, 1/I/L) are left out so a code read aloud over the
 * phone or copied off a screen lands correctly.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8
const CODE_ATTEMPTS = 5

// Deliberately permissive — the DB has no format constraint and over-strict
// patterns reject valid addresses. Mirrors the importer's rule.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type InviteCodeState = {
  status: 'idle' | 'success' | 'error'
  message: string
  /** The code just created, so the admin can copy it even if the email failed. */
  code?: string
  signupUrl?: string
}

function generateCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}

type IssuedInvite =
  | {
      ok: true
      code: string
      signupUrl: string
      /** Null when no address was given, i.e. nothing was sent. */
      delivery:
        | { sent: true }
        | { sent: false; reason: 'not_configured' | 'failed'; detail?: string }
        | null
    }
  | { ok: false; error: string }

/**
 * Creates the code, and mails the link when there is somewhere to send it.
 *
 * Module-private on purpose, and not only because a 'use server' file may
 * export nothing but async actions: it takes an arbitrary recipient, so an
 * exported version would be a network-reachable way to send mail as the app to
 * anyone. Both callers gate on admin before they get here. See the same
 * reasoning spelled out at the top of lib/statements.ts.
 */
async function issueInvite(input: {
  createdBy: string
  inviterName: string
  /** Already normalized and validated. Null means "code only, no email". */
  sendTo: string | null
  recipientName?: string | null
  expiresInDays: number
  reunionId?: string | null
}): Promise<IssuedInvite> {
  const service = createServiceClient()

  const expiresAt = expiryDate(input.expiresInDays)

  // The code column is unique, so retry on the (very unlikely) collision
  // rather than handing the admin a raw constraint error.
  let code = ''
  let inserted = false
  let lastError = ''
  for (let attempt = 0; attempt < CODE_ATTEMPTS && !inserted; attempt++) {
    code = generateCode()
    const { error } = await service.from('invite_codes').insert({
      code,
      reunion_id: input.reunionId ?? null,
      created_by: input.createdBy,
      expires_at: expiresAt.toISOString(),
      sent_to: input.sendTo,
    })
    if (!error) {
      inserted = true
    } else if (error.code === '23505') {
      lastError = error.message
    } else {
      return { ok: false, error: error.message }
    }
  }

  if (!inserted) {
    return { ok: false, error: `Could not generate a unique code. ${lastError}`.trim() }
  }

  const signupUrl = signupUrlFor(appOrigin(), code)

  if (!input.sendTo) return { ok: true, code, signupUrl, delivery: null }

  const result = await sendEmail({
    to: input.sendTo,
    subject: inviteEmailSubject(input.inviterName),
    html: inviteEmailHtml({
      signupUrl,
      inviterName: input.inviterName,
      recipientName: input.recipientName,
      expiresOn: toDateString(expiresAt),
    }),
  })

  if (result.sent) {
    await service
      .from('invite_codes')
      .update({ sent_at: new Date().toISOString() })
      .eq('code', code)
  }

  return { ok: true, code, signupUrl, delivery: result }
}

type AdminCheck =
  | { ok: true; admin: { id: string; name: string } }
  | { ok: false; message: string }

/**
 * The admin behind the current request.
 *
 * Keeps the two failures apart: a signed-out admin whose session lapsed needs
 * to hear that, not that they lack a role they in fact hold.
 */
async function currentAdmin(): Promise<AdminCheck> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'You are not signed in.' }

  const { data: member } = await supabase
    .from('members')
    .select('id, name, role')
    .eq('auth_user_id', user.id)
    .single()

  if (!member || member.role !== 'admin') {
    return { ok: false, message: 'Admin access required.' }
  }
  return { ok: true, admin: { id: member.id, name: member.name } }
}

/**
 * Creates a single-use invite code and, when an address is given, emails the
 * signup link to it. Leaving the address blank keeps the original behaviour:
 * the code is created and the admin shares the link however they like.
 */
export async function generateInviteCode(
  _prevState: InviteCodeState,
  formData: FormData
): Promise<InviteCodeState> {
  const check = await currentAdmin()
  if (!check.ok) return { status: 'error', message: check.message }
  const { admin } = check

  const reunionId = (formData.get('reunion_id') as string | null) || null
  const sendTo = ((formData.get('send_to') as string) ?? '').trim().toLowerCase()

  if (sendTo && !EMAIL_RE.test(sendTo)) {
    return { status: 'error', message: `"${sendTo}" is not a valid email address.` }
  }

  const issued = await issueInvite({
    createdBy: admin.id,
    inviterName: admin.name,
    sendTo: sendTo || null,
    expiresInDays: clampExpiryDays(formData.get('expires_in_days') as string | null),
    reunionId,
  })

  if (!issued.ok) return { status: 'error', message: issued.error }

  revalidatePath('/admin/invite')

  const { code, signupUrl, delivery } = issued

  if (!delivery) {
    return {
      status: 'success',
      message: `Code ${code} created. Copy the link and send it to whoever needs it.`,
      code,
      signupUrl,
    }
  }

  if (delivery.sent) {
    return {
      status: 'success',
      message: `Code ${code} created and emailed to ${sendTo}.`,
      code,
      signupUrl,
    }
  }

  // The code is real and usable either way — say plainly that the email did not
  // go out so the admin sends the link themselves rather than assuming it did.
  return {
    status: 'error',
    message:
      `Code ${code} was created, but the email could not be sent because ` +
      `${describeSendFailure(delivery.reason, delivery.detail)}. Copy the link below and send it yourself.`,
    code,
    signupUrl,
  }
}

export type MemberInviteResult = {
  status: 'sent' | 'created_not_sent' | 'blocked'
  message: string
  /** Present only on `created_not_sent` — the code exists, it just wasn't delivered. */
  code?: string
  signupUrl?: string
}

/**
 * Emails a fresh invite code to a member, from their row on /admin/members.
 *
 * Takes a member id rather than an address so an admin never retypes one, which
 * also means the address is whatever the directory holds — the guards below are
 * what stand between that and a wasted code.
 */
export async function sendInviteToMember(memberId: string): Promise<MemberInviteResult> {
  // Re-checked here rather than trusted from the page. The action is reachable
  // by anyone signed in, whatever the members table chose to render.
  const check = await currentAdmin()
  if (!check.ok) return { status: 'blocked', message: check.message }
  const { admin } = check

  const service = createServiceClient()
  const { data: member } = await service
    .from('members')
    .select('id, name, email, auth_user_id')
    .eq('id', memberId)
    .single()

  if (!member) {
    return { status: 'blocked', message: 'That member no longer exists.' }
  }

  // `auth_user_id` rather than `created_by_proxy`: the flag only tells you how
  // the row was created, while this column is set the moment someone has a
  // login — and a login is exactly what an invite code would be handing them.
  if (member.auth_user_id) {
    return {
      status: 'blocked',
      message: `${member.name} already has an account, so an invite code won't help them sign in.`,
    }
  }

  const email = normalizeEmail(member.email ?? '')
  if (!email || !EMAIL_RE.test(email)) {
    return {
      status: 'blocked',
      message: `${member.name} has no usable email address on file, so there is nowhere to send an invite.`,
    }
  }

  // Checked before anything is written. Unlike /admin/invite, whose job is to
  // mint a code you may well share by hand, this button exists only to deliver
  // one — so with no mailer configured, working down a directory would leave a
  // dead code behind for every row clicked.
  if (!isEmailConfigured()) {
    return {
      status: 'blocked',
      message:
        'Email is not set up yet (SMTP_USER and SMTP_PASS are missing), so nothing was sent. ' +
        'Use Invite Codes to create a link you can send yourself.',
    }
  }

  const issued = await issueInvite({
    createdBy: admin.id,
    inviterName: admin.name,
    sendTo: email,
    recipientName: member.name,
    expiresInDays: INVITE_EXPIRY_DAYS,
  })

  if (!issued.ok) return { status: 'blocked', message: issued.error }

  revalidatePath('/admin/members')
  revalidatePath('/admin/invite')

  const { code, signupUrl, delivery } = issued

  if (delivery?.sent) {
    return {
      status: 'sent',
      message: `Invite emailed to ${email}. The link is single-use and expires in ${INVITE_EXPIRY_DAYS} days.`,
    }
  }

  return {
    status: 'created_not_sent',
    message:
      `Code ${code} was created, but the email could not be sent because ` +
      `${describeSendFailure(delivery?.reason ?? 'failed', delivery?.detail)}. ` +
      'Copy the link below and send it to them yourself.',
    code,
    signupUrl,
  }
}
