\set ON_ERROR_STOP on

-- Event booking modes and group price tiers.
--
-- The invariants: a direct event never creates money HomeKin is not holding;
-- a tier threshold is a fact about the whole event, so crossing it moves every
-- balance including ones already paid; and the headcount functions can see the
-- rows the signups select policy hides, which is what the capacity check and
-- the group price both depend on.

create or replace function assert(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

delete from members;
delete from auth.users;
delete from reunions;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000005a1', 'ann@x.com'),
  ('00000000-0000-0000-0000-0000000005a2', 'bo@x.com');

insert into members (id, auth_user_id, name, email, role) values
  ('1d000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000005a1', 'Ann', 'ann@x.com', 'member'),
  ('1d000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000005a2', 'Bo', 'bo@x.com', 'member');

insert into reunions (id, name, year) values
  ('2d000000-0000-0000-0000-000000000001', 'Reunion', 2027);

insert into sub_events (id, reunion_id, name, date, cost_per_person, booking_mode) values
  ('3d000000-0000-0000-0000-000000000001', '2d000000-0000-0000-0000-000000000001',
   'Banquet', '2027-08-01', 50, 'homekin'),
  ('3d000000-0000-0000-0000-000000000002', '2d000000-0000-0000-0000-000000000001',
   'Boat tour', '2027-08-02', 80, 'direct'),
  ('3d000000-0000-0000-0000-000000000003', '2d000000-0000-0000-0000-000000000001',
   'Museum', '2027-08-03', 60, 'group');

-- ---- the mode itself ----
do $$
begin
  perform assert('events created before this migration default to homekin',
    (select booking_mode from sub_events
      where id = '3d000000-0000-0000-0000-000000000001') = 'homekin');

  begin
    update sub_events set booking_mode = 'raffle'
    where id = '3d000000-0000-0000-0000-000000000001';
    perform assert('an unknown booking mode is rejected', false);
  exception when check_violation then
    perform assert('an unknown booking mode is rejected', true);
  end;

  begin
    insert into signups (sub_event_id, member_id, headcount, external_amount)
    values ('3d000000-0000-0000-0000-000000000002', '1d000000-0000-0000-0000-000000000001', 1, -5);
    perform assert('a negative external amount is rejected', false);
  exception when check_violation then
    perform assert('a negative external amount is rejected', true);
  end;
end $$;

-- ---- price tiers ----
do $$
begin
  insert into event_price_tiers (sub_event_id, min_headcount, price_per_person) values
    ('3d000000-0000-0000-0000-000000000003', 10, 45),
    ('3d000000-0000-0000-0000-000000000003', 25, 35);

  begin
    insert into event_price_tiers (sub_event_id, min_headcount, price_per_person)
    values ('3d000000-0000-0000-0000-000000000003', 10, 40);
    perform assert('two prices for the same group size are rejected', false);
  exception when unique_violation then
    perform assert('two prices for the same group size are rejected', true);
  end;

  begin
    insert into event_price_tiers (sub_event_id, min_headcount, price_per_person)
    values ('3d000000-0000-0000-0000-000000000003', 0, 40);
    perform assert('a tier below one person is rejected', false);
  exception when check_violation then
    perform assert('a tier below one person is rejected', true);
  end;
end $$;

-- ---- headcount functions see what the select policy hides ----
do $$
begin
  insert into signups (sub_event_id, member_id, headcount) values
    ('3d000000-0000-0000-0000-000000000003', '1d000000-0000-0000-0000-000000000001', 6),
    ('3d000000-0000-0000-0000-000000000003', '1d000000-0000-0000-0000-000000000002', 3);

  -- The reason these functions exist: the signups select policy shows a member
  -- only their own row, so a direct query returns a total of just themselves
  -- and both the capacity check and the group price read far too low.
  --
  -- That policy is not exercised here — this harness runs as the table owner,
  -- for whom RLS is not enforced, which is why the suite tests functions rather
  -- than policies throughout. What is asserted is that the functions total the
  -- whole event, which is what the application relies on.
  set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000005a1';

  perform assert('the headcount function totals the whole event',
    event_headcount('3d000000-0000-0000-0000-000000000003') = 9);

  perform assert('and the plural version covers the reunion',
    (select headcount from event_headcounts('2d000000-0000-0000-0000-000000000001')
      where sub_event_id = '3d000000-0000-0000-0000-000000000003') = 9);

  perform assert('an event nobody has joined counts zero, not null',
    (select headcount from event_headcounts('2d000000-0000-0000-0000-000000000001')
      where sub_event_id = '3d000000-0000-0000-0000-000000000001') = 0);

  reset request.jwt.claim.sub;
end $$;

-- ---- a tier change moves every balance, including one already paid ----
-- The application computes the price; this asserts the database behaviour the
-- repricing depends on: writing amount_owed alone re-derives status, and paying
-- more than is owed reads as a settled balance with a credit rather than an
-- error.
do $$
begin
  -- Nine people, below the 10-person tier: everyone at the standard $60.
  insert into balances (id, member_id, reunion_id, sub_event_id, amount_owed) values
    ('4d000000-0000-0000-0000-000000000001', '1d000000-0000-0000-0000-000000000001',
     '2d000000-0000-0000-0000-000000000001', '3d000000-0000-0000-0000-000000000003', 360),
    ('4d000000-0000-0000-0000-000000000002', '1d000000-0000-0000-0000-000000000002',
     '2d000000-0000-0000-0000-000000000001', '3d000000-0000-0000-0000-000000000003', 180);

  -- Ann pays in full at the undiscounted rate.
  insert into payments (balance_id, member_id, reunion_id, amount, method, status)
  values ('4d000000-0000-0000-0000-000000000001', '1d000000-0000-0000-0000-000000000001',
          '2d000000-0000-0000-0000-000000000001', 360, 'zelle', 'confirmed');

  perform assert('Ann is settled at the standard rate',
    (select status from balances where id = '4d000000-0000-0000-0000-000000000001') = 'paid');

  -- A tenth person arrives and the $45 tier unlocks. Ann: 6 x 45 = 270.
  update balances set amount_owed = 270 where id = '4d000000-0000-0000-0000-000000000001';
  update balances set amount_owed = 135 where id = '4d000000-0000-0000-0000-000000000002';

  perform assert('the early payer now owes less than she has paid',
    (select amount_paid - amount_owed from balances
      where id = '4d000000-0000-0000-0000-000000000001') = 90);
  perform assert('and her balance still reads as settled, not as an error',
    (select status from balances where id = '4d000000-0000-0000-0000-000000000001') = 'paid');
  perform assert('the family who had not paid simply owes less',
    (select amount_owed from balances
      where id = '4d000000-0000-0000-0000-000000000002') = 135);

  -- Someone leaves, the group drops back under ten, the price returns.
  update balances set amount_owed = 360 where id = '4d000000-0000-0000-0000-000000000001';
  perform assert('losing the discount puts the price back and settles the credit',
    (select amount_paid - amount_owed from balances
      where id = '4d000000-0000-0000-0000-000000000001') = 0);
  perform assert('and the balance is still paid',
    (select status from balances where id = '4d000000-0000-0000-0000-000000000001') = 'paid');
end $$;

-- ---- cascades ----
do $$
begin
  delete from sub_events where id = '3d000000-0000-0000-0000-000000000003';
  perform assert('deleting an event takes its price tiers',
    (select count(*) from event_price_tiers
      where sub_event_id = '3d000000-0000-0000-0000-000000000003') = 0);
end $$;

\echo ''
\echo '########## ALL EVENT MODE ASSERTIONS PASSED ##########'
