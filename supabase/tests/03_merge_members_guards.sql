\set ON_ERROR_STOP on

create or replace function assert(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

-- Fixture: an admin, a plain member, and two duplicate profiles.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'admin@x.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'plain@x.com'),
  ('00000000-0000-0000-0000-0000000000b3', 'dupe@x.com');

insert into members (id, auth_user_id, name, email, role) values
  ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'Admin', 'admin@x.com', 'admin'),
  ('11000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'Plain', 'plain@x.com', 'member'),
  ('11000000-0000-0000-0000-000000000003', null, 'Dupe A', 'a@x.com', 'member'),
  ('11000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000b3', 'Dupe B', 'b@x.com', 'member');

insert into reunions (id, name, year) values ('21000000-0000-0000-0000-000000000001', 'R', 2026);
insert into sub_events (id, reunion_id, name, date) values
  ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'Dinner', '2026-08-01');

-- ---- 1. a non-admin is refused ----
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$
begin
  begin
    perform merge_members('11000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000004');
    perform assert('non-admin is refused', false);
  exception when insufficient_privilege then
    perform assert('non-admin is refused', true);
  end;
end $$;

-- ---- 2. signed-out caller is refused ----
set request.jwt.claim.sub = '';
do $$
begin
  begin
    perform merge_members('11000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000004');
    perform assert('anonymous caller is refused', false);
  exception when insufficient_privilege then
    perform assert('anonymous caller is refused', true);
  end;
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';

-- ---- 3. merging a profile into itself is refused ----
do $$
begin
  begin
    perform merge_members('11000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000003');
    perform assert('self-merge is refused', false);
  exception when invalid_parameter_value then
    perform assert('self-merge is refused', true);
  end;
end $$;

-- ---- 4. an unknown id is refused ----
do $$
begin
  begin
    perform merge_members('11000000-0000-0000-0000-0000000000ff', '11000000-0000-0000-0000-000000000004');
    perform assert('unknown member id is refused', false);
  exception when no_data_found then
    perform assert('unknown member id is refused', true);
  end;
end $$;

-- ---- 5. overlapping balances stop the merge, and nothing is written ----
insert into balances (member_id, reunion_id, sub_event_id, amount_owed, amount_paid, status) values
  ('11000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 40, 0, 'unpaid'),
  ('11000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 40, 40, 'paid');
insert into signups (sub_event_id, member_id, headcount) values
  ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000003', 1);

do $$
declare v_msg text;
begin
  begin
    perform merge_members('11000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000004');
    perform assert('overlapping balances stop the merge', false);
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    perform assert('overlapping balances stop the merge', true);
    perform assert('refusal names the sub-event', v_msg like '%Dinner%');
  end;

  -- Atomicity: the failed merge must not have moved the signup or removed anyone.
  perform assert('failed merge left the signup where it was',
    (select member_id from signups
      where sub_event_id = '31000000-0000-0000-0000-000000000001')
      = '11000000-0000-0000-0000-000000000003');
  perform assert('failed merge removed nobody',
    (select count(*) from members where id in
      ('11000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000004')) = 2);
end $$;

-- ---- 6. both sides holding a login is reported, not silently swallowed ----
delete from balances where member_id in
  ('11000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000004');
update members set auth_user_id = null where id = '11000000-0000-0000-0000-000000000002';
update members set auth_user_id = '00000000-0000-0000-0000-0000000000b2'
  where id = '11000000-0000-0000-0000-000000000003';

do $$
declare v_report jsonb;
begin
  v_report := merge_members('11000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000004');
  perform assert('merge reports the orphaned login', (v_report ->> 'orphaned_login')::boolean);
  perform assert('kept profile keeps its own login',
    (select auth_user_id from members where id = '11000000-0000-0000-0000-000000000004')
      = '00000000-0000-0000-0000-0000000000b3');
end $$;

\echo ''
\echo '########## ALL GUARD ASSERTIONS PASSED ##########'
