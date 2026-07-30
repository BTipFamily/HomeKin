'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

/**
 * Ambiguous characters (0/O, 1/I/L) are left out so a code read aloud over the
 * phone or copied off a screen lands correctly.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

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

function inviteEmailHtml(signupUrl: string, inviterName: string, expiresAt: Date): string {
  const expires = expiresAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111;">
      <h1 style="font-size:20px;margin:0 0 16px;">You're invited to join the family directory</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 16px;">
        ${inviterName} has invited you to HomeKin, where the family keeps its directory,
        reunion plans and photos in one place.
      </p>
      <p style="font-size:15px;line-height:1.5;margin:0 0 24px;">
        Click below to set up your account. You'll pick your own password.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${signupUrl}"
           style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;font-size:15px;">
          Set up my account
        </a>
      </p>
      <p style="font-size:13px;color:#666;line-height:1.5;margin:0 0 8px;">
        If the button doesn't work, copy this link into your browser:<br>
        <span style="word-break:break-all;">${signupUrl}</span>
      </p>
      <p style="font-size:13px;color:#666;line-height:1.5;margin:0;">
        This invitation can only be used once and expires on ${expires}.
      </p>
    </div>
  `
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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { status: 'error', message: 'You are not signed in.' }

  const { data: member } = await supabase
    .from('members')
    .select('id, name, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member || member.role !== 'admin') {
    return { status: 'error', message: 'Admin access required.' }
  }

  const reunionId = (formData.get('reunion_id') as string | null) || null
  const sendTo = ((formData.get('send_to') as string) ?? '').trim().toLowerCase()

  if (sendTo && !EMAIL_RE.test(sendTo)) {
    return { status: 'error', message: `"${sendTo}" is not a valid email address.` }
  }

  const parsedDays = parseInt((formData.get('expires_in_days') as string) || '30', 10)
  const expiresInDays = Number.isFinite(parsedDays)
    ? Math.min(Math.max(parsedDays, 1), 365)
    : 30

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)

  const service = createServiceClient()

  // The code column is unique, so retry on the (very unlikely) collision
  // rather than handing the admin a raw constraint error.
  let code = ''
  let inserted = false
  let lastError = ''
  for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
    code = generateCode()
    const { error } = await service.from('invite_codes').insert({
      code,
      reunion_id: reunionId,
      created_by: member.id,
      expires_at: expiresAt.toISOString(),
      sent_to: sendTo || null,
    })
    if (!error) {
      inserted = true
    } else if (error.code === '23505') {
      lastError = error.message
    } else {
      return { status: 'error', message: error.message }
    }
  }

  if (!inserted) {
    return {
      status: 'error',
      message: `Could not generate a unique code. ${lastError}`.trim(),
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const signupUrl = `${appUrl.replace(/\/$/, '')}/signup?code=${code}`

  revalidatePath('/admin/invite')

  if (!sendTo) {
    return {
      status: 'success',
      message: `Code ${code} created. Copy the link and send it to whoever needs it.`,
      code,
      signupUrl,
    }
  }

  const result = await sendEmail({
    to: sendTo,
    subject: `${member.name} invited you to the family directory`,
    html: inviteEmailHtml(signupUrl, member.name, expiresAt),
  })

  if (result.sent) {
    await service
      .from('invite_codes')
      .update({ sent_at: new Date().toISOString() })
      .eq('code', code)
    revalidatePath('/admin/invite')
    return {
      status: 'success',
      message: `Code ${code} created and emailed to ${sendTo}.`,
      code,
      signupUrl,
    }
  }

  // The code is real and usable either way — say plainly that the email did not
  // go out so the admin sends the link themselves rather than assuming it did.
  const why =
    result.reason === 'not_configured'
      ? 'email is not set up yet (SMTP_USER and SMTP_PASS are missing)'
      : `the email provider rejected it${result.detail ? ` — ${result.detail}` : ''}`

  return {
    status: 'error',
    message: `Code ${code} was created, but the email could not be sent because ${why}. Copy the link below and send it yourself.`,
    code,
    signupUrl,
  }
}
