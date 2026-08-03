\set ON_ERROR_STOP on

-- Merging duplicate profiles must not destroy money records.
--
-- The invariant: what a family has paid is derived from an immutable ledger.
-- A merge moves balances to the surviving profile, so if it does not also move
-- the payments those balances were derived from, the recalc trigger recomputes
-- them from a ledger that lost the rows — and a settled balance silently
-- reopens.

create or replace function assert(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

delete from members;
delete from auth.users;
delete from reunions;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000002a1', 'keep@x.com'),
  ('00000000-0000-0000-0000-0000000002a2', 'dupe@x.com'),
  ('00000000-0000-0000-0000-0000000002a3', 'boss@x.com');

insert into members (id, auth_user_id, name, email, role) values
  ('1a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000002a1', 'Keep', 'keep@x.com', 'member'),
  ('1a000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000002a2', 'Dupe', 'dupe@x.com', 'member'),
  ('1a000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000002a3', 'Boss', 'boss@x.com', 'admin');

insert into reunions (id, name, year) values
  ('2a000000-0000-0000-0000-000000000001', 'Reunion', 2027);
insert into sub_events (id, reunion_id, name, date, cost_per_person) values
  ('3a000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', 'Banquet', '2027-08-01', 100);

-- Only the duplicate profile owes and has paid. Deliberately no balance on the
-- surviving profile, so the merge is not refused for a balance conflict.
insert into balances (id, member_id, reunion_id, sub_event_id, amount_owed) values
  ('4a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000002',
   '2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', 100);

insert into payments (balance_id, member_id, reunion_id, amount, method, status, stripe_session_id) values
  ('4a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000002',
   '2a000000-0000-0000-0000-000000000001', 60, 'stripe', 'confirmed', 'cs_test_merge_1'),
  ('4a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000002',
   '2a000000-0000-0000-0000-000000000001', 40, 'zelle', 'confirmed', null);

do $$
begin
  perform assert('the duplicate profile has paid in full before the merge',
    (select amount_paid from balances where id = '4a000000-0000-0000-0000-000000000001') = 100);
  perform assert('and the balance reads as settled',
    (select status from balances where id = '4a000000-0000-0000-0000-000000000001') = 'paid');
  perform assert('with two payments on the ledger',
    (select count(*) from payments where balance_id = '4a000000-0000-0000-0000-000000000001') = 2);
end $$;

do $$
declare v_report jsonb;
begin
  set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000002a3';
  v_report := merge_members(
    '1a000000-0000-0000-0000-000000000002',
    '1a000000-0000-0000-0000-000000000001'
  );

  perform assert('the merge reports moving the payments',
    (v_report ->> 'payments_moved')::int = 2);

  -- The regression this migration exists for: before it, both rows were
  -- cascade-deleted with the source profile and amount_paid fell to 0.
  perform assert('both payments survive the merge',
    (select count(*) from payments where balance_id = '4a000000-0000-0000-0000-000000000001') = 2);
  perform assert('and now belong to the surviving profile',
    (select count(*) from payments
      where balance_id = '4a000000-0000-0000-0000-000000000001'
        and member_id = '1a000000-0000-0000-0000-000000000001') = 2);

  perform assert('the balance still reads as paid in full',
    (select amount_paid from balances where id = '4a000000-0000-0000-0000-000000000001') = 100);
  perform assert('and has not silently reopened',
    (select status from balances where id = '4a000000-0000-0000-0000-000000000001') = 'paid');

  perform assert('the Stripe payment keeps its session id, so a replay still cannot double-count',
    (select count(*) from payments where stripe_session_id = 'cs_test_merge_1') = 1);
end $$;

\echo ''
\echo '########## ALL MERGE PAYMENT ASSERTIONS PASSED ##########'
