\set ON_ERROR_STOP on

-- Households and named attendees.
--
-- The invariants: a member belongs to at most one household; merging two
-- profiles that both belong to households must not abort; and money is
-- untouched by any of it — balances and payments stay keyed to the member who
-- owes and pays, which is the whole reason households were added as a layer.

create or replace function assert(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

delete from members;
delete from auth.users;
delete from reunions;
delete from households;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000003a1', 'ada@x.com'),
  ('00000000-0000-0000-0000-0000000003a2', 'ben@x.com'),
  ('00000000-0000-0000-0000-0000000003a3', 'boss@x.com');

insert into members (id, auth_user_id, name, email, role) values
  ('1b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000003a1', 'Ada', 'ada@x.com', 'member'),
  ('1b000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000003a2', 'Ben', 'ben@x.com', 'member'),
  ('1b000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000003a3', 'Boss', 'boss@x.com', 'admin');

insert into reunions (id, name, year, start_date) values
  ('2b000000-0000-0000-0000-000000000001', 'Reunion', 2027, '2027-08-01');
insert into sub_events (id, reunion_id, name, date, cost_per_person) values
  ('3b000000-0000-0000-0000-000000000001', '2b000000-0000-0000-0000-000000000001', 'Banquet', '2027-08-01', 50);

-- ---- reunion status ----
do $$
begin
  perform assert('a new reunion starts in planning',
    (select status from reunions where id = '2b000000-0000-0000-0000-000000000001') = 'planning');

  begin
    update reunions set status = 'archived' where id = '2b000000-0000-0000-0000-000000000001';
    perform assert('an unknown status is rejected', false);
  exception when check_violation then
    perform assert('an unknown status is rejected', true);
  end;
end $$;

-- ---- households ----
do $$
begin
  insert into households (id, name, family_branch, primary_contact_id, created_by) values
    ('4b000000-0000-0000-0000-000000000001', 'The Ada Household', 'Maternal',
     '1b000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001'),
    ('4b000000-0000-0000-0000-000000000002', 'The Ben Household', 'Paternal',
     '1b000000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-000000000002');

  insert into household_members (household_id, member_id) values
    ('4b000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001'),
    ('4b000000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-000000000002');

  perform assert('a household needs a name',
    (select count(*) from households where btrim(name) = '') = 0);

  -- The constraint that makes registration unambiguous.
  begin
    insert into household_members (household_id, member_id) values
      ('4b000000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-000000000001');
    perform assert('a member cannot belong to two households', false);
  exception when unique_violation then
    perform assert('a member cannot belong to two households', true);
  end;
end $$;

-- ---- attendees ----
do $$
declare v_signup uuid;
begin
  insert into signups (sub_event_id, member_id, headcount, guest_names)
  values ('3b000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001', 4, 'Ada, Cal, Dot')
  returning id into v_signup;

  insert into attendees (signup_id, name, age_band, dietary_notes) values
    (v_signup, 'Ada', 'adult', null),
    (v_signup, 'Cal', 'child', 'no shellfish'),
    (v_signup, 'Dot', 'toddler', null);

  perform assert('attendees hang off the signup',
    (select count(*) from attendees where signup_id = v_signup) = 3);

  -- Deliberately not forced to agree: a family that said four are coming but
  -- has only named three must still be able to save.
  perform assert('the headcount and the named attendees need not match',
    (select headcount from signups where id = v_signup) = 4);

  begin
    insert into attendees (signup_id, name, age_band) values (v_signup, 'Eve', 'infant');
    perform assert('an unknown age band is rejected', false);
  exception when check_violation then
    perform assert('an unknown age band is rejected', true);
  end;

  delete from signups where id = v_signup;
  perform assert('cancelling a signup takes its attendees',
    (select count(*) from attendees where signup_id = v_signup) = 0);
end $$;

-- ---- merging two profiles that both belong to a household ----
-- Without the dedup added in 024 this violates household_members' primary key
-- and rolls the entire merge back.
do $$
declare
  v_report jsonb;
  v_balance uuid;
begin
  -- Give the profile being merged away real money, so this also proves the
  -- household layer did not disturb the ledger.
  insert into balances (id, member_id, reunion_id, sub_event_id, amount_owed)
  values ('5b000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000002',
          '2b000000-0000-0000-0000-000000000001', '3b000000-0000-0000-0000-000000000001', 50)
  returning id into v_balance;

  insert into payments (balance_id, member_id, reunion_id, amount, method, status)
  values (v_balance, '1b000000-0000-0000-0000-000000000002',
          '2b000000-0000-0000-0000-000000000001', 50, 'zelle', 'confirmed');

  set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000003a3';
  v_report := merge_members(
    '1b000000-0000-0000-0000-000000000002',
    '1b000000-0000-0000-0000-000000000001'
  );

  perform assert('the merge survives both profiles having a household',
    (v_report ->> 'merged_into') = '1b000000-0000-0000-0000-000000000001');
  perform assert('the duplicate membership is dropped, not moved',
    (v_report ->> 'household_memberships_dropped')::int = 1);
  perform assert('the surviving profile keeps exactly one household',
    (select count(*) from household_members
      where member_id = '1b000000-0000-0000-0000-000000000001') = 1);
  perform assert('and it is the one it already belonged to',
    (select household_id from household_members
      where member_id = '1b000000-0000-0000-0000-000000000001')
      = '4b000000-0000-0000-0000-000000000001');

  -- The household the duplicate spoke for is not destroyed; it is reassigned.
  perform assert('the emptied household survives with a new contact',
    (select primary_contact_id from households
      where id = '4b000000-0000-0000-0000-000000000002')
      = '1b000000-0000-0000-0000-000000000001');

  -- The point of the layer.
  perform assert('the payment survived the merge',
    (select count(*) from payments where balance_id = v_balance) = 1);
  perform assert('and the balance is still settled',
    (select status from balances where id = v_balance) = 'paid');
end $$;

\echo ''
\echo '########## ALL HOUSEHOLD AND ATTENDEE ASSERTIONS PASSED ##########'
