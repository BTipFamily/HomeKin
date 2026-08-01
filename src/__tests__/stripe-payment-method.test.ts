// Naming what a payment was made with.
//
// The invariant worth protecting: a wallet payment arrives from Stripe as an
// ordinary card with the wallet named underneath it. Read the type and ignore
// the wallet and every Apple Pay payment files as 'card' — which is the one
// distinction this whole column exists to record.

import type Stripe from 'stripe'
import { formatPaymentMethod, stripePaymentMethodSlug } from '@/lib/stripe-payment-method'

/** Minimal stand-in — the mapping only ever reads `type` and `card.wallet.type`. */
function paymentMethod(type: string, wallet?: string): Stripe.PaymentMethod {
  return {
    type,
    ...(wallet ? { card: { wallet: { type: wallet } } } : {}),
  } as unknown as Stripe.PaymentMethod
}

describe('stripePaymentMethodSlug', () => {
  it('reports the wallet, not the card underneath it', () => {
    expect(stripePaymentMethodSlug(paymentMethod('card', 'apple_pay'))).toBe('apple_pay')
    expect(stripePaymentMethodSlug(paymentMethod('card', 'google_pay'))).toBe('google_pay')
  })

  it('reports a bare card as a card', () => {
    expect(stripePaymentMethodSlug(paymentMethod('card'))).toBe('card')
  })

  it('reports Cash App Pay, which is a type rather than a wallet', () => {
    expect(stripePaymentMethodSlug(paymentMethod('cashapp'))).toBe('cashapp')
  })

  it('passes through a type it has never seen', () => {
    expect(stripePaymentMethodSlug(paymentMethod('revolut_pay'))).toBe('revolut_pay')
  })

  it('returns null when Stripe gave us nothing', () => {
    // The webhook falls back to null rather than failing the payment, so this
    // is a value the column genuinely stores.
    expect(stripePaymentMethodSlug(null)).toBeNull()
    expect(stripePaymentMethodSlug(undefined)).toBeNull()
  })
})

describe('formatPaymentMethod', () => {
  it('prefers the Stripe detail over the bare method', () => {
    expect(formatPaymentMethod('stripe', 'apple_pay')).toBe('Apple Pay')
    expect(formatPaymentMethod('stripe', 'cashapp')).toBe('Cash App Pay')
  })

  it('falls back to the method when there is no detail', () => {
    // Every Stripe payment taken before the detail was captured looks like
    // this, as does one whose lookup failed. Deliberately not 'Card' — it may
    // well have been a wallet, and we have nothing to back the narrower claim.
    expect(formatPaymentMethod('stripe', null)).toBe('Online payment')
    expect(formatPaymentMethod('stripe')).toBe('Online payment')
    expect(formatPaymentMethod('stripe', '')).toBe('Online payment')
  })

  it('labels the manual methods', () => {
    expect(formatPaymentMethod('zelle')).toBe('Zelle')
    expect(formatPaymentMethod('check')).toBe('Check')
    expect(formatPaymentMethod('other')).toBe('Other')
  })

  it('keeps a manually reported Cash App payment distinct from Stripe Cash App Pay', () => {
    // Same money, different promise: one is confirmed by Stripe, the other is a
    // member's word awaiting the committee.
    expect(formatPaymentMethod('cashapp')).toBe('Cash App Pay')
    expect(formatPaymentMethod('stripe', 'cashapp')).toBe('Cash App Pay')
  })

  it('title-cases a slug it has no label for', () => {
    expect(formatPaymentMethod('stripe', 'revolut_pay')).toBe('Revolut Pay')
    expect(formatPaymentMethod('stripe', 'grabpay')).toBe('Grabpay')
  })

  it('never renders an empty label', () => {
    expect(formatPaymentMethod('')).toBe('Unknown')
  })
})
