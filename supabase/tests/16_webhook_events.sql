\set ON_ERROR_STOP on

create or replace function assert(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

delete from members;
delete from auth.users;
delete from reunions;
delete from webhook_events;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'admin@x.com');
insert into members (id, auth_user_id, name, email, role) values
  ('16000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'Admin', 'admin@x.com', 'admin'),
  ('16000000-0000-0000-0000-000000000002', null, 'Payer', 'payer@x.com', 'member');

insert into reunions (id, name, year) values ('26000000-0000-0000-0000-000000000001', 'R', 2026);
insert into sub_events (id, reunion_id, name, date, cost_per_person) values
  ('36000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', 'Banquet', '2026-08-01', 50);

insert into balances (id, member_id, reunion_id, sub_event_id, amount_owed, amount_paid) values
  ('46000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000002',
   '26000000-0000-0000-0000-000000000001', '36000000-0000-0000-0000-000000000001', 100, 0);

-- ---- claiming an event ----

do $$
begin
  perform assert('a new event is claimed',
    claim_webhook_event('evt_1', 'checkout.session.completed'));

  perform assert('the claim is logged with its type',
    (select type from webhook_events where stripe_event_id = 'evt_1') = 'checkout.session.completed');

  -- The whole point of the table: Stripe redelivers, and the second delivery
  -- must not run the handler again.
  perform assert('a redelivery arriving while the first is in flight is refused',
    not claim_webhook_event('evt_1', 'checkout.session.completed'));

  perform complete_webhook_event('evt_1');

  perform assert('completing the event stamps processed_at',
    (select processed_at from webhook_events where stripe_event_id = 'evt_1') is not null);

  perform assert('a redelivery of a finished event is refused',
    not claim_webhook_event('evt_1', 'checkout.session.completed'));
end $$;

-- ---- the case a bare "on conflict do nothing" gets wrong ----
--
-- A handler that crashed left a row with no processed_at. Swallowing Stripe's
-- retry as a duplicate would lose that payment for good, so the retry has to be
-- allowed through once the dead attempt has gone stale.

do $$
begin
  perform assert('a second event claims', claim_webhook_event('evt_2', 'charge.refunded'));
  perform complete_webhook_event('evt_2', 'the database was unreachable');

  perform assert('a failed handler leaves the event unprocessed',
    (select processed_at from webhook_events where stripe_event_id = 'evt_2') is null);
  perform assert('and records why',
    (select error from webhook_events where stripe_event_id = 'evt_2') = 'the database was unreachable');

  -- Stripe can redeliver within a minute or two, so a failure that said so is
  -- retryable at once. Making it wait out a staleness timeout would mean
  -- answering 200 to the retry of an event that was never handled, which loses
  -- the payment for good.
  perform assert('a retry of a recorded failure is allowed through immediately',
    claim_webhook_event('evt_2', 'charge.refunded'));
  perform assert('reclaiming clears the previous error',
    (select error from webhook_events where stripe_event_id = 'evt_2') is null);

  perform complete_webhook_event('evt_2');
  perform assert('and it can then be finished',
    (select processed_at from webhook_events where stripe_event_id = 'evt_2') is not null);
end $$;

-- ---- an attempt that vanished without saying anything ----
--
-- The function was killed mid-flight: no processed_at, no error, and nothing
-- that can say whether it is still running. This is the only case that has to
-- be timed out.

do $$
begin
  perform assert('a third event claims', claim_webhook_event('evt_3', 'checkout.session.completed'));

  perform assert('a concurrent delivery is refused while the first may still be running',
    not claim_webhook_event('evt_3', 'checkout.session.completed'));

  update webhook_events set received_at = now() - interval '10 minutes'
    where stripe_event_id = 'evt_3';

  perform assert('a retry of a stale unfinished event is allowed through',
    claim_webhook_event('evt_3', 'checkout.session.completed'));

  perform complete_webhook_event('evt_3');
  perform assert('and a replay after that is refused',
    not claim_webhook_event('evt_3', 'checkout.session.completed'));
end $$;

-- A finished event is never reclaimed however old it gets.
do $$
begin
  update webhook_events set received_at = now() - interval '30 days'
    where stripe_event_id = 'evt_1';

  perform assert('an old finished event is still refused',
    not claim_webhook_event('evt_1', 'checkout.session.completed'));
end $$;

-- ---- refunds in the ledger ----

do $$
declare v_err text;
begin
  insert into payments (balance_id, member_id, reunion_id, amount, method, stripe_session_id, stripe_payment_intent_id)
  values ('46000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000002',
          '26000000-0000-0000-0000-000000000001', 100, 'stripe', 'cs_test_refund', 'pi_test_refund');

  perform assert('the card payment settles the balance',
    (select status from balances where id = '46000000-0000-0000-0000-000000000001') = 'paid');

  insert into payments (balance_id, member_id, reunion_id, amount, method, stripe_refund_id, stripe_payment_intent_id)
  values ('46000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000002',
          '26000000-0000-0000-0000-000000000001', -40, 'stripe', 're_test_1', 'pi_test_refund');

  perform assert('a refund reduces amount_paid through the same trigger',
    (select amount_paid from balances where id = '46000000-0000-0000-0000-000000000001') = 60);
  perform assert('and the balance goes back to partially paid',
    (select status from balances where id = '46000000-0000-0000-0000-000000000001') = 'partially_paid');

  -- The guarantee that makes the refund handler safe to replay: the same Stripe
  -- refund object cannot be credited twice, whatever the handler does.
  begin
    insert into payments (balance_id, member_id, reunion_id, amount, method, stripe_refund_id)
    values ('46000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000002',
            '26000000-0000-0000-0000-000000000001', -40, 'stripe', 're_test_1');
    perform assert('a redelivered refund is rejected', false);
  exception when unique_violation then
    perform assert('a redelivered refund is rejected', true);
  end;

  perform assert('and did not move the balance',
    (select amount_paid from balances where id = '46000000-0000-0000-0000-000000000001') = 60);

  -- A second, genuinely different refund is a second row.
  insert into payments (balance_id, member_id, reunion_id, amount, method, stripe_refund_id, stripe_payment_intent_id)
  values ('46000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000002',
          '26000000-0000-0000-0000-000000000001', -60, 'stripe', 're_test_2', 'pi_test_refund');

  perform assert('a second partial refund clears the rest',
    (select amount_paid from balances where id = '46000000-0000-0000-0000-000000000001') = 0);

  -- A refund that reads as a payment would inflate the balance it is meant to
  -- reduce, so the sign is not left to whoever writes the row.
  begin
    insert into payments (balance_id, member_id, reunion_id, amount, method, stripe_refund_id)
    values ('46000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000002',
            '26000000-0000-0000-0000-000000000001', 40, 'stripe', 're_positive');
    perform assert('a positive refund row is rejected', false);
  exception when check_violation then
    perform assert('a positive refund row is rejected', true);
  end;

  -- Manual refunds carry no Stripe id, and there can be any number of them.
  insert into payments (balance_id, member_id, reunion_id, amount, method) values
    ('46000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000002',
     '26000000-0000-0000-0000-000000000001', -1, 'check'),
    ('46000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000002',
     '26000000-0000-0000-0000-000000000001', -1, 'check');

  perform assert('manual refunds are not constrained by the Stripe refund id',
    (select count(*) from payments where stripe_refund_id is null and amount < 0) = 2);
end $$;

-- ---- the endpoint owns this table ----

do $$
begin
  perform assert('webhook_events is not readable through RLS',
    (select relrowsecurity from pg_class where relname = 'webhook_events'));

  perform assert('and has no policy letting anybody signed in near it',
    (select count(*) from pg_policies where tablename = 'webhook_events') = 0);

  -- Claiming an event id before Stripe delivers it would make the real delivery
  -- look like a replay, and the payment would never be recorded. Not something
  -- a signed-in member gets to do.
  perform assert('a signed-in member cannot claim a webhook event',
    not has_function_privilege('authenticated', 'claim_webhook_event(text, text)', 'execute'));
  perform assert('nor close one out',
    not has_function_privilege('authenticated', 'complete_webhook_event(text, text)', 'execute'));
  perform assert('nor can a signed-out visitor',
    not has_function_privilege('anon', 'claim_webhook_event(text, text)', 'execute'));
  perform assert('the webhook endpoint still can',
    has_function_privilege('service_role', 'claim_webhook_event(text, text)', 'execute'));
end $$;
