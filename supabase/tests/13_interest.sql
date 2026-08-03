\set ON_ERROR_STOP on

-- Interest responses.
--
-- The invariant: one answer per person per reunion, so the projection counts
-- each family once. That same key would abort a merge of two profiles who both
-- answered, which is precisely when an admin is merging real duplicates.

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
  ('00000000-0000-0000-0000-0000000004a1', 'ivy@x.com'),
  ('00000000-0000-0000-0000-0000000004a2', 'ivy2@x.com'),
  ('00000000-0000-0000-0000-0000000004a3', 'boss@x.com');

insert into members (id, auth_user_id, name, email, role) values
  ('1c000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000004a1', 'Ivy', 'ivy@x.com', 'member'),
  ('1c000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000004a2', 'Ivy Dup', 'ivy2@x.com', 'member'),
  ('1c000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000004a3', 'Boss', 'boss@x.com', 'admin');

insert into reunions (id, name, year, status) values
  ('2c000000-0000-0000-0000-000000000001', 'Reunion', 2028, 'interest'),
  ('2c000000-0000-0000-0000-000000000002', 'Other', 2029, 'interest');

do $$
begin
  insert into interest_responses
    (reunion_id, member_id, attending, adults, youth, children, preferred_months, budget_band, lodging_need)
  values
    ('2c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000001',
     'yes', 2, 1, 1, array[6,7], '100_250', 'hotel');

  perform assert('an interest response is stored',
    (select adults from interest_responses
      where reunion_id = '2c000000-0000-0000-0000-000000000001'
        and member_id = '1c000000-0000-0000-0000-000000000001') = 2);

  -- Changing your mind updates the answer rather than adding a second opinion.
  begin
    insert into interest_responses (reunion_id, member_id, attending)
    values ('2c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000001', 'no');
    perform assert('a member cannot answer the same reunion twice', false);
  exception when unique_violation then
    perform assert('a member cannot answer the same reunion twice', true);
  end;

  -- But the same person may answer for a different reunion.
  insert into interest_responses (reunion_id, member_id, attending)
  values ('2c000000-0000-0000-0000-000000000002', '1c000000-0000-0000-0000-000000000001', 'probably');
  perform assert('the same member can answer a different reunion',
    (select count(*) from interest_responses
      where member_id = '1c000000-0000-0000-0000-000000000001') = 2);

  begin
    insert into interest_responses (reunion_id, member_id, attending)
    values ('2c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000002', 'maybe');
    perform assert('an unknown attending value is rejected', false);
  exception when check_violation then
    perform assert('an unknown attending value is rejected', true);
  end;

  begin
    insert into interest_responses (reunion_id, member_id, attending, preferred_months)
    values ('2c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000002', 'yes', array[13]);
    perform assert('a month number that is not a month is rejected', false);
  exception when check_violation then
    perform assert('a month number that is not a month is rejected', true);
  end;

  begin
    insert into interest_responses (reunion_id, member_id, attending, adults)
    values ('2c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000002', 'yes', -1);
    perform assert('a negative party size is rejected', false);
  exception when check_violation then
    perform assert('a negative party size is rejected', true);
  end;
end $$;

-- ---- merging two profiles that both answered ----
do $$
declare v_report jsonb;
begin
  -- The duplicate answered the same reunion, and one the survivor did not.
  insert into interest_responses (reunion_id, member_id, attending, adults) values
    ('2c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000002', 'probably', 9);

  set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a3';
  v_report := merge_members(
    '1c000000-0000-0000-0000-000000000002',
    '1c000000-0000-0000-0000-000000000001'
  );

  perform assert('the merge survives both profiles having answered',
    (v_report ->> 'merged_into') = '1c000000-0000-0000-0000-000000000001');
  perform assert('the duplicate answer is dropped, not moved',
    (v_report ->> 'interest_responses_dropped')::int = 1);
  perform assert('the surviving profile keeps its own answer',
    (select adults from interest_responses
      where reunion_id = '2c000000-0000-0000-0000-000000000001'
        and member_id = '1c000000-0000-0000-0000-000000000001') = 2);
  perform assert('one answer per reunion remains, so the projection counts once',
    (select count(*) from interest_responses
      where reunion_id = '2c000000-0000-0000-0000-000000000001') = 1);
end $$;

-- ---- cascades ----
do $$
begin
  delete from reunions where id = '2c000000-0000-0000-0000-000000000001';
  perform assert('deleting a reunion clears its interest responses',
    (select count(*) from interest_responses
      where reunion_id = '2c000000-0000-0000-0000-000000000001') = 0);

  delete from members where id = '1c000000-0000-0000-0000-000000000001';
  perform assert('deleting a member clears their interest responses',
    (select count(*) from interest_responses) = 0);
end $$;

\echo ''
\echo '########## ALL INTEREST ASSERTIONS PASSED ##########'
