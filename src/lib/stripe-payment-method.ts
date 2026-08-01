import type Stripe from 'stripe'

/**
 * Naming what a payment was actually made with.
 *
 * Pure on purpose: no Stripe client, no Supabase, just the mapping, so the
 * wallet-detection rule below can be tested directly rather than through a
 * webhook.
 */

/** Labels we want to read better than a title-cased slug would. */
const LABELS: Record<string, string> = {
  // Wallets, as reported by card.wallet.type
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  samsung_pay: 'Samsung Pay',
  link: 'Link',
  amex_express_checkout: 'Amex Express Checkout',
  masterpass: 'Masterpass',
  visa_checkout: 'Visa Checkout',

  // Stripe payment method types
  card: 'Card',
  cashapp: 'Cash App Pay',
  us_bank_account: 'Bank transfer',
  acss_debit: 'Bank transfer',
  sepa_debit: 'Bank transfer',
  klarna: 'Klarna',
  affirm: 'Affirm',
  afterpay_clearpay: 'Afterpay',

  // A Stripe payment whose specifics we do not have: either it predates this
  // column, or the lookup failed. 'Card' would be the friendlier label but it
  // asserts something we cannot back — the member may well have used a wallet.
  stripe: 'Online payment',

  // The methods HomeKin records by hand
  zelle: 'Zelle',
  check: 'Check',
  other: 'Other',
}

/**
 * Title-cases a slug we have no label for, so a method Stripe ships tomorrow
 * renders as 'Revolut Pay' rather than crashing or showing 'revolut_pay'.
 */
function titleCase(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * The slug to store for a Stripe payment.
 *
 * The rule that matters: a wallet payment does not arrive as its own type. It
 * arrives as an ordinary `card` with the wallet named at `card.wallet.type`.
 * Reading `pm.type` alone would file every Apple Pay and Google Pay payment as
 * a plain card — the exact distinction this column exists to record — so the
 * wallet is checked first and `pm.type` is the fallback.
 *
 * Cash App Pay is different again: it is a type in its own right, so it comes
 * through the fallback rather than the wallet branch.
 */
export function stripePaymentMethodSlug(
  pm: Stripe.PaymentMethod | null | undefined
): string | null {
  if (!pm) return null
  const wallet = pm.card?.wallet?.type
  if (wallet) return wallet
  return pm.type ?? null
}

/**
 * How a payment is described to a member or the committee.
 *
 * `stripePaymentMethod` wins when present: 'Apple Pay' tells the reader more
 * than 'Stripe' does. Older Stripe payments have none and still read 'Stripe',
 * which is true, just less specific.
 */
export function formatPaymentMethod(
  method: string,
  stripePaymentMethod?: string | null
): string {
  const slug = stripePaymentMethod?.trim() || method
  if (!slug) return 'Unknown'
  return LABELS[slug] ?? titleCase(slug)
}
