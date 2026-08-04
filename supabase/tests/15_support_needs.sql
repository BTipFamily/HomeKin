\set ON_ERROR_STOP on

-- Member support needs, interest date ranges, and location suggestions.
--
-- The invariant that matters most here is a privacy one: the whole reason
-- support needs live in their own table is that `members` is readable in full
-- by every authenticated user. If merging or cascading leaks these rows, the
-- feature is worse than not having shipped it.
--
-- Note this harness runs as the table owner, for whom RLS is not enforced, so
-- the *policy* is asserted by reading it back from pg_policies rather than by
-- impersonation. What is exercised behaviourally is everything else: the key,
-- the cascade, and the merge.

create or replace function assert(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

delete from members;
delete from auth.users;
delete from reunions;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000006a1', 'cara@x.com'),
  ('00000000-0000-0000-0000-0000000006a2', 'cara2@x.com'),
  ('00000000-0000-0000-0000-0000000006a3', 'boss@x.com');

insert into members (id, auth_user_id, name, email, role) values
  ('1e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000006a1', 'Cara', 'cara@x.com', 'member'),
  ('1e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000006a2', 'Cara Dup', 'cara2@x.com', 'member'),
  ('1e000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000006a3', 'Boss', 'boss@x.com', 'admin');

insert into reunions (id, name, year, status) values
  ('2e000000-0000-0000-0000-000000000001', 'Reunion', 2028, 'interest');

-- ---- the privacy claim, read off the policy itself ----
do $$
declare v_using text;
begin
  perform assert('support needs have row level security on',
    (select relrowsecurity from pg_class where relname = 'member_support_needs'));

  select pg_get_expr(polqual, polrelid) into v_using
  from pg_policy
  where polrelid = 'member_support_needs'::regclass and polcmd = 'r';

  -- The three ways a row may be read, and no fourth.
  perform assert('a member can read their own needs',
    v_using like '%get_my_member_id%');
  perform assert('the committee can read everyone''s',
    v_using like '%get_my_role%');
  perform assert('and anybody can read a row its owner chose to share',
    v_using like '%share_with_family%');

  -- The default that matters: filling the form in must not publish it.
  perform assert('sharing is off unless it is chosen',
    (select column_default from information_schema.columns
      where table_name = 'member_support_needs' and column_name = 'share_with_family') = 'false');
end $$;

-- ---- one row per member, and it goes when they do ----
do $$
begin
  insert into member_support_needs (member_id, dietary_notes, mobility_notes) values
    ('1e000000-0000-0000-0000-000000000001', 'coeliac', 'no stairs'),
    ('1e000000-0000-0000-0000-000000000002', 'from the duplicate profile', null);

  begin
    insert into member_support_needs (member_id, dietary_notes)
    values ('1e000000-0000-0000-0000-000000000001', 'second row');
    perform assert('a member cannot have two sets of needs', false);
  exception when unique_violation then
    perform assert('a member cannot have two sets of needs', true);
  end;
end $$;

-- ---- merging two profiles that both recorded needs ----
-- Without the fold added in 030 this violates the primary key and aborts the
-- whole merge — and the merge is exactly when an admin is dealing with the
-- duplicate profiles this app creates by design.
do $$
declare v_report jsonb;
begin
  set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000006a3';
  v_report := merge_members(
    '1e000000-0000-0000-0000-000000000002',
    '1e000000-0000-0000-0000-000000000001'
  );

  perform assert('the merge survives both profiles having support needs',
    (v_report ->> 'merged_into') = '1e000000-0000-0000-0000-000000000001');
  perform assert('the duplicate''s needs are dropped, not merged',
    (v_report ->> 'support_needs_dropped')::int = 1);
  perform assert('one row remains',
    (select count(*) from member_support_needs) = 1);
  -- Half of one person's allergies and half of another's is more dangerous
  -- than either alone, so the survivor's record is kept whole.
  perform assert('and it is the surviving profile''s, unaltered',
    (select dietary_notes from member_support_needs
      where member_id = '1e000000-0000-0000-0000-000000000001') = 'coeliac');
end $$;

do $$
begin
  delete from members where id = '1e000000-0000-0000-0000-000000000001';
  perform assert('deleting a member takes their support needs with them',
    (select count(*) from member_support_needs) = 0);
end $$;

-- ---- interest date ranges ----
do $$
declare v_response uuid;
begin
  insert into members (id, name, email, role)
  values ('1e000000-0000-0000-0000-000000000004', 'Dee', 'dee@x.com', 'member');

  insert into interest_responses
    (reunion_id, member_id, attending, adults, suggested_locations, food_preferences)
  values ('2e000000-0000-0000-0000-000000000001', '1e000000-0000-0000-0000-000000000004',
          'yes', 2, array['Atlanta, GA', 'Charleston'], array['cookout', 'potluck'])
  returning id into v_response;

  insert into interest_date_ranges (response_id, starts_on, ends_on) values
    (v_response, '2028-07-12', '2028-07-19'),
    (v_response, '2028-08-25', '2028-08-25');

  perform assert('a family can give more than one window',
    (select count(*) from interest_date_ranges where response_id = v_response) = 2);
  perform assert('a single day is a legitimate window',
    (select count(*) from interest_date_ranges
      where response_id = v_response and starts_on = ends_on) = 1);

  begin
    insert into interest_date_ranges (response_id, starts_on, ends_on)
    values (v_response, '2028-07-19', '2028-07-12');
    perform assert('a window that ends before it starts is rejected', false);
  exception when check_violation then
    perform assert('a window that ends before it starts is rejected', true);
  end;

  begin
    update interest_responses set food_preferences = array['banquet']
    where id = v_response;
    perform assert('an unknown food preference is rejected', false);
  exception when check_violation then
    perform assert('an unknown food preference is rejected', true);
  end;

  perform assert('location suggestions are kept as typed',
    (select suggested_locations[1] from interest_responses where id = v_response) = 'Atlanta, GA');

  delete from interest_responses where id = v_response;
  perform assert('dropping an answer takes its windows',
    (select count(*) from interest_date_ranges where response_id = v_response) = 0);
end $$;

\echo ''
\echo '########## ALL SUPPORT NEEDS AND INTEREST DATE ASSERTIONS PASSED ##########'
