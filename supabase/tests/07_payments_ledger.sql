\set ON_ERROR_STOP on

create or replace function assert(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

delete from members;
delete from auth.users;
delete from reunions;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'admin@x.com');
insert into members (id, auth_user_id, name, email, role) values
  ('15000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e1', 'Admin', 'admin@x.com', 'admin'),
  ('15000000-0000-0000-0000-000000000002', null, 'Payer', 'payer@x.com', 'member');

insert into reunions (id, name, year) values ('25000000-0000-0000-0000-000000000001', 'R', 2026);
insert into sub_events (id, reunion_id, name, date, cost_per_person) values
  ('35000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', 'Banquet', '2026-08-01', 50),
  ('35000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000001', 'Picnic', '2026-08-02', 50);

insert into balances (id, member_id, reunion_id, sub_event_id, amount_owed, amount_paid) values
  ('45000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002',
   '25000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000001', 100, 0);

do $$
begin
  perform assert('a new balance derives as unpaid',
    (select status from balances where id = '45000000-0000-0000-0000-000000000001') = 'unpaid');
end $$;

-- ---- the bug this table exists to make impossible ----
do $$
begin
  -- $40 by Zelle, then $60 by card. The old code stored 60.
  insert into payments (balance_id, member_id, reunion_id, amount, method) values
    ('45000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002',
     '25000000-0000-0000-0000-000000000001', 40, 'zelle');

  perform assert('a partial payment sums, and the balance goes partially_paid',
    (select amount_paid from balances where id = '45000000-0000-0000-0000-000000000001') = 40);
  perform assert('status reflects a partial payment',
    (select status from balances where id = '45000000-0000-0000-0000-000000000001') = 'partially_paid');

  insert into payments (balance_id, member_id, reunion_id, amount, method, stripe_session_id) values
    ('45000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002',
     '25000000-0000-0000-0000-000000000001', 60, 'stripe', 'cs_test_123');

  perform assert('a second payment adds rather than replaces',
    (select amount_paid from balances where id = '45000000-0000-0000-0000-000000000001') = 100);
  perform assert('the balance settles once payments cover it',
    (select status from balances where id = '45000000-0000-0000-0000-000000000001') = 'paid');
end $$;

-- ---- Stripe replay safety ----
do $$
begin
  begin
    insert into payments (balance_id, member_id, reunion_id, amount, method, stripe_session_id) values
      ('45000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002',
       '25000000-0000-0000-0000-000000000001', 60, 'stripe', 'cs_test_123');
    perform assert('a replayed Stripe session cannot double-count', false);
  exception when unique_violation then
    perform assert('a replayed Stripe session cannot double-count', true);
  end;

  perform assert('the replay left the balance untouched',
    (select amount_paid from balances where id = '45000000-0000-0000-0000-000000000001') = 100);
end $$;

-- ---- refunds ----
do $$
begin
  insert into payments (balance_id, member_id, reunion_id, amount, method, note) values
    ('45000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002',
     '25000000-0000-0000-0000-000000000001', -25, 'stripe', 'Partial refund');

  perform assert('a refund reduces the paid total',
    (select amount_paid from balances where id = '45000000-0000-0000-0000-000000000001') = 75);
  perform assert('a refund reopens the balance',
    (select status from balances where id = '45000000-0000-0000-0000-000000000001') = 'partially_paid');

  -- Put it back for the remaining tests.
  delete from payments where amount = -25;
  perform assert('deleting a payment recomputes the balance',
    (select amount_paid from balances where id = '45000000-0000-0000-0000-000000000001') = 100);
end $$;

do $$
begin
  begin
    insert into payments (balance_id, member_id, reunion_id, amount, method) values
      ('45000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002',
       '25000000-0000-0000-0000-000000000001', 0, 'other');
    perform assert('a zero-amount payment is rejected', false);
  exception when check_violation then
    perform assert('a zero-amount payment is rejected', true);
  end;
end $$;

-- ---- pending payments ----
insert into balances (id, member_id, reunion_id, sub_event_id, amount_owed, amount_paid) values
  ('45000000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000002',
   '25000000-0000-0000-0000-000000000001', null, 80, 0);

do $$
begin
  insert into payments (id, balance_id, member_id, reunion_id, amount, method, status) values
    ('55000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000002',
     '15000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000001',
     80, 'check', 'pending');

  perform assert('a pending payment does not count toward the balance',
    (select amount_paid from balances where id = '45000000-0000-0000-0000-000000000002') = 0);
  perform assert('a pending payment moves the balance to pending_confirmation',
    (select status from balances where id = '45000000-0000-0000-0000-000000000002')
      = 'pending_confirmation');

  update payments set status = 'confirmed' where id = '55000000-0000-0000-0000-000000000001';

  perform assert('confirming a pending payment credits the balance',
    (select amount_paid from balances where id = '45000000-0000-0000-0000-000000000002') = 80);
  perform assert('confirming settles the balance',
    (select status from balances where id = '45000000-0000-0000-0000-000000000002') = 'paid');
end $$;

-- ---- amount_owed changing re-derives status ----
do $$
begin
  update balances set amount_owed = 150 where id = '45000000-0000-0000-0000-000000000002';
  perform assert('raising the amount owed reopens a settled balance',
    (select status from balances where id = '45000000-0000-0000-0000-000000000002')
      = 'partially_paid');

  update balances set amount_owed = 80 where id = '45000000-0000-0000-0000-000000000002';
  perform assert('lowering it back settles it again',
    (select status from balances where id = '45000000-0000-0000-0000-000000000002') = 'paid');
end $$;

-- ---- headcount drift ----
-- Adding a guest after paying used to leave amount_owed at the old figure, so
-- the extra was never billed. amount_owed is now always recalculated and the
-- derived status does the rest.
insert into balances (id, member_id, reunion_id, sub_event_id, amount_owed, amount_paid) values
  ('45000000-0000-0000-0000-000000000003', '15000000-0000-0000-0000-000000000002',
   '25000000-0000-0000-0000-000000000001', '35000000-0000-0000-0000-000000000002', 50, 0);

do $$
begin
  insert into payments (balance_id, member_id, reunion_id, amount, method) values
    ('45000000-0000-0000-0000-000000000003', '15000000-0000-0000-0000-000000000002',
     '25000000-0000-0000-0000-000000000001', 50, 'stripe');
  perform assert('one guest paid in full',
    (select status from balances where id = '45000000-0000-0000-0000-000000000003') = 'paid');

  -- A second guest added: 2 x $50.
  update balances set amount_owed = 100 where id = '45000000-0000-0000-0000-000000000003';

  perform assert('adding a guest after paying reopens the balance',
    (select status from balances where id = '45000000-0000-0000-0000-000000000003')
      = 'partially_paid');
  perform assert('the top-up owed is the difference, not the whole amount again',
    (select amount_owed - amount_paid from balances
      where id = '45000000-0000-0000-0000-000000000003') = 50);

  -- Dropping back to one guest settles it again without touching the payment.
  update balances set amount_owed = 50 where id = '45000000-0000-0000-0000-000000000003';
  perform assert('removing the guest settles it again',
    (select status from balances where id = '45000000-0000-0000-0000-000000000003') = 'paid');
  perform assert('the original payment is untouched throughout',
    (select amount_paid from balances where id = '45000000-0000-0000-0000-000000000003') = 50);
end $$;

-- ---- cancelling after paying ----
do $$
begin
  -- What cancelSignup does when money has already changed hands: zero what is
  -- owed and leave the payment, so the overpayment reads as a refund due.
  update balances set amount_owed = 0 where id = '45000000-0000-0000-0000-000000000003';

  perform assert('cancelling after paying leaves the payment in place',
    (select amount_paid from balances where id = '45000000-0000-0000-0000-000000000003') = 50);
  perform assert('nothing is owed once cancelled',
    (select amount_owed from balances where id = '45000000-0000-0000-0000-000000000003') = 0);
  perform assert('the balance reads as settled, with the payment showing as a credit',
    (select status from balances where id = '45000000-0000-0000-0000-000000000003') = 'paid');
  perform assert('the payment record survives for the refund',
    (select count(*) from payments
      where balance_id = '45000000-0000-0000-0000-000000000003') = 1);
end $$;

-- ---- stripe_payment_method ----
do $$
declare v_id uuid;
begin
  -- The column is deliberately unconstrained. A CHECK here would mean the day
  -- Stripe ships a method we have not enumerated, the webhook insert fails, the
  -- handler 500s, Stripe retries, and money arrives that nothing records. This
  -- asserts that a method nobody has heard of is still storable.
  insert into payments (balance_id, member_id, reunion_id, amount, method, status,
                        stripe_session_id, stripe_payment_method)
  values ('45000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002',
          '25000000-0000-0000-0000-000000000001', 5, 'stripe', 'confirmed',
          'cs_test_unknown_method', 'a_method_invented_after_this_test_was_written')
  returning id into v_id;

  perform assert('an unrecognised Stripe method is stored rather than rejected',
    (select stripe_payment_method from payments where id = v_id)
      = 'a_method_invented_after_this_test_was_written');

  -- The wallet detail must not disturb what the ledger is actually for.
  perform assert('a payment carrying a wallet still counts toward the balance',
    (select amount_paid from balances where id = '45000000-0000-0000-0000-000000000001') = 105);

  delete from payments where id = v_id;
  perform assert('removing it restores the balance',
    (select amount_paid from balances where id = '45000000-0000-0000-0000-000000000001') = 100);
end $$;

do $$
begin
  -- Manual payments have no Stripe detail, and nothing was backfilled: the
  -- information was never captured, and a guess in the ledger is worse than a null.
  perform assert('manual payments carry no Stripe method',
    (select count(*) from payments
      where method <> 'stripe' and stripe_payment_method is not null) = 0);
end $$;

-- ---- cascades ----
do $$
begin
  perform assert('payments exist before the balance is removed',
    (select count(*) from payments where balance_id = '45000000-0000-0000-0000-000000000002') = 1);
  delete from balances where id = '45000000-0000-0000-0000-000000000002';
  perform assert('deleting a balance takes its payments with it',
    (select count(*) from payments where balance_id = '45000000-0000-0000-0000-000000000002') = 0);
end $$;

\echo ''
\echo '########## ALL PAYMENTS LEDGER ASSERTIONS PASSED ##########'
