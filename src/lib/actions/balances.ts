'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendReceipt } from '@/lib/statements'
import type { PaymentMethod } from '@/types/database'
import { actionSuccess, failedWith, type ActionState } from '@/lib/action-state'

const MANUAL_METHODS: PaymentMethod[] = ['zelle', 'cashapp', 'check', 'other']

/**
 * Nothing in here writes balances.amount_paid or balances.status — both are
 * derived from the payments table by trigger. Recording a payment means
 * inserting a row; correcting one means editing or deleting that row.
 */

function parseAmount(raw: unknown, label: string): number {
  const amount = Number(raw)
  if (!Number.isFinite(amount)) throw new Error(`${label} must be a number.`)
  // Money in a numeric(10,2) column, so refuse anything that would silently round.
  const rounded = Math.round(amount * 100) / 100
  if (rounded === 0) throw new Error(`${label} cannot be zero.`)
  return rounded
}

async function currentMember(): Promise<{ id: string; role: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: member } = await supabase
    .from('members')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!member) throw new Error('Member not found')
  return member as { id: string; role: string }
}

function revalidateFor(reunionId: string, memberId?: string) {
  revalidatePath(`/reunion/${reunionId}/budget`)
  revalidatePath(`/reunion/${reunionId}/signups`)
  revalidatePath(`/reunion/${reunionId}/report`)
  if (memberId) revalidatePath(`/directory/${memberId}`)
}

/**
 * Acknowledges a payment by email, without letting a mail failure undo it.
 *
 * Money moving is the part that must not be lost. `sendReceipt` dedupes on its
 * own, so calling this twice for one payment sends one email.
 */
async function emailReceipt(paymentId: string) {
  try {
    await sendReceipt(paymentId)
  } catch (e) {
    console.error('[Balances] Failed to send receipt:', e instanceof Error ? e.message : e)
  }
}

/**
 * A member telling the committee they have paid outside Stripe.
 *
 * Records a pending payment for a real amount rather than flipping the balance
 * to 'pending_confirmation' with no figure attached, so a part payment can be
 * reported honestly.
 */
async function applyManualPayment(
  balanceId: string,
  method: PaymentMethod,
  amount: number,
  reunionId: string,
  note?: string
) {
  const member = await currentMember()

  if (!MANUAL_METHODS.includes(method)) {
    throw new Error('Pick how the payment was made.')
  }
  const value = parseAmount(amount, 'The amount')
  if (value < 0) throw new Error('Report the amount you paid, not a refund.')

  const service = createServiceClient()
  const { data: balance } = await service
    .from('balances')
    .select('id, member_id, reunion_id, amount_owed, amount_paid')
    .eq('id', balanceId)
    .single()

  if (!balance || balance.member_id !== member.id) throw new Error('Balance not found')

  const outstanding = Number(balance.amount_owed) - Number(balance.amount_paid)
  if (outstanding <= 0) throw new Error('This balance is already settled.')
  if (value > outstanding) {
    throw new Error(
      `That is more than the $${outstanding.toFixed(2)} outstanding. Ask the committee to record an overpayment.`
    )
  }

  const { error } = await service.from('payments').insert({
    balance_id: balanceId,
    member_id: member.id,
    reunion_id: balance.reunion_id,
    amount: value,
    method,
    status: 'pending',
    note: note?.trim() || null,
    recorded_by: member.id,
  })

  if (error) throw new Error(error.message)
  revalidateFor(reunionId, member.id)
}

/** Committee agreeing that a reported payment really arrived. */
async function applyConfirmPayment(paymentId: string, reunionId: string) {
  const member = await currentMember()
  if (!['committee', 'admin'].includes(member.role)) {
    throw new Error('Committee access required')
  }

  const service = createServiceClient()
  const { data: payment } = await service
    .from('payments')
    .select('id, member_id, status')
    .eq('id', paymentId)
    .single()
  if (!payment) throw new Error('Payment not found')
  if (payment.status === 'confirmed') return

  const { error } = await service
    .from('payments')
    .update({ status: 'confirmed', recorded_by: member.id })
    .eq('id', paymentId)

  if (error) throw new Error(error.message)
  revalidateFor(reunionId, payment.member_id as string)

  // Now that the money is agreed, tell the member. This is the acknowledgement
  // worth sending — not the one when they reported it themselves.
  await emailReceipt(paymentId)
}

/**
 * Committee recording a payment directly — cash handed over at an event, a
 * cheque in the post, or a correcting refund (a negative amount).
 */
export async function recordPayment(input: {
  balanceId: string
  amount: number
  method: PaymentMethod
  paidAt?: string
  note?: string
  reunionId: string
}) {
  const member = await currentMember()
  if (!['committee', 'admin'].includes(member.role)) {
    throw new Error('Committee access required')
  }

  const value = parseAmount(input.amount, 'The amount')

  const service = createServiceClient()
  const { data: balance } = await service
    .from('balances')
    .select('id, member_id, reunion_id')
    .eq('id', input.balanceId)
    .single()
  if (!balance) throw new Error('Balance not found')

  const { data: inserted, error } = await service
    .from('payments')
    .insert({
      balance_id: balance.id,
      member_id: balance.member_id,
      reunion_id: balance.reunion_id,
      amount: value,
      method: input.method,
      status: 'confirmed',
      paid_at: input.paidAt ? new Date(input.paidAt).toISOString() : new Date().toISOString(),
      note: input.note?.trim() || null,
      recorded_by: member.id,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidateFor(input.reunionId, balance.member_id as string)

  // A negative amount is a refund being recorded, which `sendReceipt` declines
  // to acknowledge rather than thanking somebody for money going the other way.
  if (inserted) await emailReceipt(inserted.id as string)
}

/**
 * Removes a payment recorded in error.
 *
 * Stripe payments are left alone: the money genuinely moved, and deleting the
 * record would put the app out of step with Stripe. Refund those in Stripe and
 * record the refund here as a negative amount instead.
 */
async function applyDeletePayment(paymentId: string, reunionId: string) {
  const member = await currentMember()
  if (!['committee', 'admin'].includes(member.role)) {
    throw new Error('Committee access required')
  }

  const service = createServiceClient()
  const { data: payment } = await service
    .from('payments')
    .select('id, member_id, method')
    .eq('id', paymentId)
    .single()
  if (!payment) throw new Error('Payment not found')

  if (payment.method === 'stripe') {
    throw new Error(
      'Stripe payments cannot be deleted, because the money really moved. Refund it in Stripe, then record the refund here as a negative amount.'
    )
  }

  const { error } = await service.from('payments').delete().eq('id', paymentId)
  if (error) throw new Error(error.message)
  revalidateFor(reunionId, payment.member_id as string)
}

// ---------------------------------------------------------------------------
// The exported actions.
//
// These are called imperatively from client components rather than posted to
// from a form, which is why they keep their argument lists. What changes is the
// return: a rejected Server Action promise is redacted in production exactly
// like a thrown form action, so manual-pay-form.tsx and payment-row.tsx were
// catching an error whose message React had already removed. The messages here
// are about somebody's money, and are the ones most worth reading.
// ---------------------------------------------------------------------------

/** A member saying they have paid by Zelle, cheque or similar. */
export async function reportManualPayment(
  balanceId: string,
  method: PaymentMethod,
  amount: number,
  reunionId: string,
  note?: string
): Promise<ActionState> {
  try {
    await applyManualPayment(balanceId, method, amount, reunionId, note)
  } catch (e) {
    return failedWith(e, 'That payment could not be recorded.')
  }
  return actionSuccess('Reported — the committee will confirm it.')
}

/** The committee vouching that money arrived. Emails the member a receipt. */
export async function confirmPayment(
  paymentId: string,
  reunionId: string
): Promise<ActionState> {
  try {
    await applyConfirmPayment(paymentId, reunionId)
  } catch (e) {
    return failedWith(e, 'That payment could not be confirmed.')
  }
  return actionSuccess('Confirmed, and a receipt has been emailed.')
}

/** Removing a reported payment that never turned up. */
export async function deletePayment(
  paymentId: string,
  reunionId: string
): Promise<ActionState> {
  try {
    await applyDeletePayment(paymentId, reunionId)
  } catch (e) {
    return failedWith(e, 'That payment could not be removed.')
  }
  return actionSuccess('Removed, and the amount is back on their balance.')
}
