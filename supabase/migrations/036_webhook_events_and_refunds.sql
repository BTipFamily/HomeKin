-- ============================================================
-- Webhook idempotency, and refunds that come back from Stripe
-- ============================================================
--
-- Two gaps in the payment path, both in the same place.
--
-- 1. Replay protection today is the unique index on payments.stripe_session_id.
--    That is a real guarantee and it stays, but it only covers the one handler
--    that inserts a payment. Every event type added after it — a refund, a
--    failed intent, anything Connect-shaped later — starts with no protection
--    at all, and the mistake is invisible until Stripe redelivers. The guard
--    belongs to the endpoint, not to one insert inside it.
--
-- 2. Stripe can refund a charge from the dashboard, and nothing here hears
--    about it. `payments.amount <> 0` was written so a negative row means a
--    refund, but only a committee member typing one ever produced one. A card
--    refunded at Stripe left the ledger claiming money the family no longer
--    had.
--
-- Both are fixed without touching how money is derived: refunds arrive as
-- ordinary negative rows in `payments`, and balances.amount_paid falls out of
-- the same trigger as always.

-- ---------------------------------------------------------------
-- The delivery log
-- ---------------------------------------------------------------
--
-- One row per Stripe event id, inserted before any work is done. `processed_at`
-- is what separates "we are handling this" from "this is finished", and that
-- distinction is the whole point: a handler that crashes half way leaves an
-- unfinished row, and Stripe's retry has to be allowed through rather than
-- swallowed as a duplicate. An endpoint that returns 200 to the retry of an
-- event it never actually processed loses the payment silently, which is worse
-- than processing one twice.

create table webhook_events (
  stripe_event_id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  -- Null while in flight, and null again after a failure, so the retry can
  -- reclaim it. Set exactly once the handler has finished.
  processed_at timestamptz,
  error text
);

create index webhook_events_received_idx on webhook_events (received_at desc);
create index webhook_events_unprocessed_idx on webhook_events (received_at)
  where processed_at is null;

comment on column webhook_events.received_at is
  'When the current attempt claimed this event. Reset when a later attempt reclaims it.';

/**
 * Claims an event for processing. True means "you own this, do the work".
 *
 * Four outcomes, all decided by one statement so two concurrent deliveries
 * cannot both win:
 *   - unseen event       -> inserted, claimed
 *   - already finished   -> not claimed (this is the replay case)
 *   - failed and waiting -> reclaimed, because the last attempt said it failed
 *   - started and stale  -> reclaimed, because the attempt that took it is gone
 *
 * The last two are separate on purpose. An attempt that failed and said so can
 * be retried the moment Stripe sends the event again — waiting out a timeout
 * would risk refusing a retry that arrived quickly, and refusing a retry of an
 * event that was never processed loses the payment for good. Only an attempt
 * that vanished without recording anything — the function killed mid-flight —
 * has to be timed out, because nothing else can say whether it is still
 * running. Five minutes is far longer than any handler here is allowed to live.
 */
create or replace function claim_webhook_event(p_event_id text, p_type text)
returns boolean
language plpgsql
as $$
declare
  v_claimed boolean;
begin
  insert into webhook_events (stripe_event_id, type)
  values (p_event_id, p_type)
  on conflict (stripe_event_id) do update
    set received_at = now(), error = null
    where webhook_events.processed_at is null
      and (
        webhook_events.error is not null
        or webhook_events.received_at < now() - interval '5 minutes'
      )
  returning true into v_claimed;

  -- No row came back: either the event is finished, or another attempt holds a
  -- claim that is neither failed nor stale. Either way this caller does nothing.
  return coalesce(v_claimed, false);
end $$;

/**
 * Closes out a claim.
 *
 * A failure deliberately leaves processed_at null rather than recording an
 * outcome: the event is not done, and Stripe will send it again. The message is
 * kept so the row says why the last attempt failed.
 */
create or replace function complete_webhook_event(p_event_id text, p_error text default null)
returns void
language sql
as $$
  update webhook_events
  set processed_at = case when p_error is null then now() else null end,
      error = p_error
  where stripe_event_id = p_event_id;
$$;

-- Nobody signed in has any business here: the table is written by the webhook
-- endpoint under the service role and read by nothing else.
alter table webhook_events enable row level security;

-- anon and authenticated are named as well as public, because a Supabase project
-- can carry default privileges that grant them execute on new functions
-- directly, and a revoke from public does not take an explicit grant away.
--
-- Worth being exact about: somebody who could call claim_webhook_event could
-- claim an event id before Stripe delivered it, and the real delivery would
-- then be refused as a replay. That is a way to make a payment silently not
-- happen, from an ordinary signed-in account.
revoke execute on function claim_webhook_event(text, text) from public, anon, authenticated;
revoke execute on function complete_webhook_event(text, text) from public, anon, authenticated;
grant execute on function claim_webhook_event(text, text) to service_role;
grant execute on function complete_webhook_event(text, text) to service_role;

-- ---------------------------------------------------------------
-- Tying a payment back to what Stripe calls it
-- ---------------------------------------------------------------
--
-- The session id is how a checkout is recognised on the way in. It is not how
-- anything is recognised on the way back: a refund event carries a charge and a
-- payment intent and knows nothing about the session that started it. Recording
-- the intent at payment time is what makes a refund findable without asking
-- Stripe to walk backwards.

alter table payments
  add column stripe_payment_intent_id text,

  -- One negative row per Stripe refund object, keyed by that object's id. This
  -- is the same posture as stripe_session_id: unique, so a redelivered refund
  -- event cannot double-credit, enforced by the database rather than by
  -- remembering to check. Null on manual refunds the committee types in, and
  -- Postgres lets nulls repeat.
  add column stripe_refund_id text unique;

-- A refund that reads as a payment would inflate the very balance it is meant
-- to reduce, so the sign is not left to the caller.
alter table payments add constraint payments_stripe_refund_is_negative
  check (stripe_refund_id is null or amount < 0);

create index payments_stripe_payment_intent_idx on payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

comment on column payments.stripe_payment_intent_id is
  'The PaymentIntent behind this payment. Set on card payments so refund and reconciliation events can find the row. Null on manual payments.';
comment on column payments.stripe_refund_id is
  'Set only on rows created from a Stripe refund. Unique, so a redelivered refund event cannot double-count.';
