-- ============================================================
-- Which Stripe method was used: Apple Pay, Google Pay, Cash App Pay, a card
-- ============================================================
--
-- Every Stripe payment lands in the ledger as method = 'stripe', which was
-- enough when a card was the only way to pay. Once the wallets are enabled a
-- committee member reviewing the budget page sees a column of identical
-- 'stripe' rows, and a member's receipt cannot tell them what they just paid
-- with either. The information exists on Stripe's side; it simply was never
-- recorded here.
--
-- This is a second, nullable column rather than new values in the `method`
-- CHECK constraint, for three reasons:
--
--   * A CHECK is a list of everything Stripe will ever offer, maintained by
--     hand. The day Stripe adds a method we have not enumerated, the webhook's
--     insert fails, the handler returns 500, Stripe retries, and the money is
--     received but never recorded. A payment must not be lost because we did
--     not predict its name.
--   * method = 'cashapp' already means something different: a member saying
--     they sent money through Cash App, unverified, awaiting the committee.
--     MANUAL_METHODS in src/lib/actions/balances.ts and the deletePayment
--     guard both key off `method`, and a Stripe-confirmed Cash App Pay payment
--     landing in that bucket would be offered for deletion and counted as
--     manual in the budget totals.
--   * Leaving `method` alone means recalc_balance() and
--     balances_derive_status() need no changes at all.
--
-- Null is the honest value for every manual payment and for any Stripe payment
-- recorded before this column existed. Nothing is backfilled: the detail was
-- not captured at the time and inventing it would put a guess in the ledger.

alter table payments add column stripe_payment_method text;

comment on column payments.stripe_payment_method is
  'Stripe payment method slug: apple_pay, google_pay, cashapp, link, card, us_bank_account, … '
  'Null for manual payments and for Stripe payments recorded before this was captured. '
  'Deliberately unconstrained — see 018 migration notes.';
