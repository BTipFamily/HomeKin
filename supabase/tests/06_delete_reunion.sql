\set ON_ERROR_STOP on

create or replace function assert(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

delete from members;
delete from auth.users;
delete from reunions;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'admin@x.com'),
  ('00000000-0000-0000-0000-0000000000d2', 'plain@x.com');

insert into members (id, auth_user_id, name, email, role) values
  ('14000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'Admin', 'admin@x.com', 'admin'),
  ('14000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d2', 'Plain', 'plain@x.com', 'member');

-- The reunion being deleted, plus a second one that must survive untouched.
insert into reunions (id, name, year) values
  ('24000000-0000-0000-0000-000000000001', 'Doomed Reunion', 2026),
  ('24000000-0000-0000-0000-000000000002', 'Keeper Reunion', 2027);

insert into sub_events (id, reunion_id, name, date) values
  ('34000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', 'Picnic', '2026-08-01'),
  ('34000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000001', 'Banquet', '2026-08-02'),
  ('34000000-0000-0000-0000-000000000003', '24000000-0000-0000-0000-000000000002', 'Keeper Dinner', '2027-08-01');

insert into signups (sub_event_id, member_id, headcount) values
  ('34000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000002', 2),
  ('34000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000002', 1),
  ('34000000-0000-0000-0000-000000000003', '14000000-0000-0000-0000-000000000002', 3);

insert into balances (member_id, reunion_id, sub_event_id, amount_owed, amount_paid, status) values
  ('14000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 100, 60, 'partially_paid'),
  ('14000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000003', 50, 50, 'paid');

insert into announcements (reunion_id, title, body) values
  ('24000000-0000-0000-0000-000000000001', 'Hi', 'Body');
insert into invitations (reunion_id, member_id) values
  ('24000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000002');
insert into surveys (id, reunion_id, title, questions) values
  ('44000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', 'Menu', '[]');
insert into survey_responses (survey_id, member_id, answers) values
  ('44000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000002', '{}');
insert into photos (id, reunion_id, storage_path, tagged_members) values
  ('54000000-0000-0000-0000-000000000001', '24000000-0000-0000-0000-000000000001', 'reunion-1/a.jpg', '{}'),
  ('54000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000001', 'reunion-1/b.jpg', '{}'),
  ('54000000-0000-0000-0000-000000000003', '24000000-0000-0000-0000-000000000002', 'reunion-2/keep.jpg', '{}');
insert into messages (reunion_id, body) values
  ('24000000-0000-0000-0000-000000000001', 'hello');
insert into reunion_timeline_items (reunion_id, title) values
  ('24000000-0000-0000-0000-000000000001', 'Book venue');
insert into reunion_budget_estimates (reunion_id, nights) values
  ('24000000-0000-0000-0000-000000000001', 2);
-- Scoped to the doomed reunion: must survive, unscoped rather than deleted.
insert into invite_codes (code, reunion_id) values
  ('SCOPED01', '24000000-0000-0000-0000-000000000001');

-- ---- authorization ----
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
do $$
begin
  begin
    perform delete_reunion('24000000-0000-0000-0000-000000000001');
    perform assert('a non-admin cannot delete a reunion', false);
  exception when insufficient_privilege then
    perform assert('a non-admin cannot delete a reunion', true);
  end;
end $$;

set request.jwt.claim.sub = '';
do $$
begin
  begin
    perform delete_reunion('24000000-0000-0000-0000-000000000001');
    perform assert('an anonymous caller cannot delete a reunion', false);
  exception when insufficient_privilege then
    perform assert('an anonymous caller cannot delete a reunion', true);
  end;
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
do $$
begin
  begin
    perform delete_reunion('24000000-0000-0000-0000-0000000000ff');
    perform assert('deleting an unknown reunion is refused', false);
  exception when no_data_found then
    perform assert('deleting an unknown reunion is refused', true);
  end;
end $$;

-- A refused attempt must not have destroyed anything.
do $$
begin
  perform assert('refused attempts left both reunions in place',
    (select count(*) from reunions) = 2);
end $$;

-- ---- the delete ----
do $$
declare r jsonb;
begin
  r := delete_reunion('24000000-0000-0000-0000-000000000001');

  perform assert('report names the reunion', r ->> 'deleted_name' = 'Doomed Reunion');
  perform assert('report counts sub-events', (r ->> 'sub_events')::int = 2);
  perform assert('report counts signups across its events', (r ->> 'signups')::int = 2);
  perform assert('report counts balances', (r ->> 'balances')::int = 1);
  perform assert('report surfaces money paid', (r ->> 'amount_paid')::numeric = 60);
  perform assert('report surfaces money owed', (r ->> 'amount_owed')::numeric = 100);
  perform assert('report counts announcements', (r ->> 'announcements')::int = 1);
  perform assert('report counts invitations', (r ->> 'invitations')::int = 1);
  perform assert('report counts surveys', (r ->> 'surveys')::int = 1);
  perform assert('report counts survey responses', (r ->> 'survey_responses')::int = 1);
  perform assert('report counts photos', (r ->> 'photos')::int = 2);
  perform assert('report counts messages', (r ->> 'messages')::int = 1);
  perform assert('report counts timeline items', (r ->> 'timeline_items')::int = 1);
  perform assert('report notes the invite code being unscoped',
    (r ->> 'invite_codes_unscoped')::int = 1);

  -- The whole reason this is a function: the files need sweeping separately.
  perform assert('report returns both storage paths',
    jsonb_array_length(r -> 'storage_paths') = 2);
  perform assert('storage paths are the ones from this reunion only',
    (r -> 'storage_paths') @> '["reunion-1/a.jpg", "reunion-1/b.jpg"]'::jsonb);
  perform assert('storage paths exclude the other reunion',
    not ((r -> 'storage_paths') @> '["reunion-2/keep.jpg"]'::jsonb));
end $$;

-- ---- what cascaded ----
do $$
begin
  perform assert('the reunion row is gone',
    not exists (select 1 from reunions where id = '24000000-0000-0000-0000-000000000001'));
  perform assert('its sub-events cascaded',
    not exists (select 1 from sub_events where reunion_id = '24000000-0000-0000-0000-000000000001'));
  perform assert('signups on those sub-events cascaded',
    not exists (select 1 from signups where sub_event_id in
      ('34000000-0000-0000-0000-000000000001','34000000-0000-0000-0000-000000000002')));
  perform assert('its balances cascaded',
    not exists (select 1 from balances where reunion_id = '24000000-0000-0000-0000-000000000001'));
  perform assert('its announcements cascaded',
    not exists (select 1 from announcements where reunion_id = '24000000-0000-0000-0000-000000000001'));
  perform assert('its surveys cascaded',
    not exists (select 1 from surveys where reunion_id = '24000000-0000-0000-0000-000000000001'));
  perform assert('survey responses cascaded with the survey',
    not exists (select 1 from survey_responses
      where survey_id = '44000000-0000-0000-0000-000000000001'));
  perform assert('its photo rows cascaded',
    not exists (select 1 from photos where reunion_id = '24000000-0000-0000-0000-000000000001'));
  perform assert('its messages cascaded',
    not exists (select 1 from messages where reunion_id = '24000000-0000-0000-0000-000000000001'));
  perform assert('its timeline items cascaded',
    not exists (select 1 from reunion_timeline_items
      where reunion_id = '24000000-0000-0000-0000-000000000001'));
  perform assert('its budget estimate cascaded',
    not exists (select 1 from reunion_budget_estimates
      where reunion_id = '24000000-0000-0000-0000-000000000001'));
end $$;

-- ---- what must survive ----
do $$
begin
  perform assert('the scoped invite code survives, now unscoped',
    (select reunion_id from invite_codes where code = 'SCOPED01') is null);
  perform assert('members are untouched', (select count(*) from members) = 2);

  perform assert('the other reunion survives',
    exists (select 1 from reunions where id = '24000000-0000-0000-0000-000000000002'));
  perform assert('the other reunion keeps its sub-event',
    exists (select 1 from sub_events where id = '34000000-0000-0000-0000-000000000003'));
  perform assert('the other reunion keeps its signup',
    exists (select 1 from signups where sub_event_id = '34000000-0000-0000-0000-000000000003'));
  perform assert('the other reunion keeps its balance',
    exists (select 1 from balances where reunion_id = '24000000-0000-0000-0000-000000000002'));
  perform assert('the other reunion keeps its photo',
    exists (select 1 from photos where id = '54000000-0000-0000-0000-000000000003'));
end $$;

\echo ''
\echo '########## ALL REUNION DELETE ASSERTIONS PASSED ##########'
