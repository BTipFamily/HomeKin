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
  ('35000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001', 'Banquet', '2026-08-01', 50);

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
