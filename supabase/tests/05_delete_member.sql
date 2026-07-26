\set ON_ERROR_STOP on

create or replace function assert(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

delete from members;
delete from auth.users;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'admin@x.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'admin2@x.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'target@x.com');

insert into members (id, auth_user_id, name, email, role) values
  ('13000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'Admin One', 'admin@x.com', 'admin'),
  ('13000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c3', 'Target', 'target@x.com', 'member'),
  ('13000000-0000-0000-0000-000000000003', null, 'Bystander', 'by@x.com', 'member');

insert into reunions (id, name, year) values ('23000000-0000-0000-0000-000000000001', 'R', 2026);
insert into sub_events (id, reunion_id, name, date) values
  ('33000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'Dinner', '2026-08-01');

insert into signups (sub_event_id, member_id, headcount) values
  ('33000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 2);
insert into balances (member_id, reunion_id, sub_event_id, amount_owed, amount_paid, status) values
  ('13000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', 80, 30, 'partially_paid');
insert into relationships (member_id, related_member_id, relationship_type, parent_child_kind) values
  ('13000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000003', 'parent_child', 'biological');
insert into surveys (id, reunion_id, title, questions, created_by) values
  ('43000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', 'Menu', '[]', '13000000-0000-0000-0000-000000000002');
insert into survey_responses (survey_id, member_id, answers) values
  ('43000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', '{}');
insert into messages (id, reunion_id, sender_id, body) values
  ('63000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 'hello');
insert into photos (id, reunion_id, uploaded_by, storage_path, tagged_members) values
  ('53000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 'a.jpg',
   array['13000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000003']::uuid[]),
  ('53000000-0000-0000-0000-000000000002', '23000000-0000-0000-0000-000000000001', null, 'b.jpg',
   array['13000000-0000-0000-0000-000000000002']::uuid[]);

-- ---- authorization ----
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
do $$
begin
  begin
    perform delete_member('13000000-0000-0000-0000-000000000003');
    perform assert('non-admin cannot delete', false);
  exception when insufficient_privilege then
    perform assert('non-admin cannot delete', true);
  end;
end $$;

set request.jwt.claim.sub = '';
do $$
begin
  begin
    perform delete_member('13000000-0000-0000-0000-000000000003');
    perform assert('anonymous caller cannot delete', false);
  exception when insufficient_privilege then
    perform assert('anonymous caller cannot delete', true);
  end;
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

-- ---- lockout guards ----
do $$
begin
  begin
    perform delete_member('13000000-0000-0000-0000-000000000001');
    perform assert('an admin cannot delete themselves', false);
  exception when invalid_parameter_value then
    perform assert('an admin cannot delete themselves', true);
  end;
end $$;

do $$
begin
  -- Refusing self-deletion is what guarantees an admin always remains: the
  -- caller must be an admin, so the only route to deleting the last one is
  -- deleting yourself.
  perform assert('exactly one admin exists',
    (select count(*) from members where role = 'admin') = 1);

  -- Demote the actor and the same call must now fail on privilege instead.
  update members set role = 'member' where id = '13000000-0000-0000-0000-000000000001';
  begin
    perform delete_member('13000000-0000-0000-0000-000000000002');
    perform assert('a demoted actor loses the ability to delete', false);
  exception when insufficient_privilege then
    perform assert('a demoted actor loses the ability to delete', true);
  end;
  update members set role = 'admin' where id = '13000000-0000-0000-0000-000000000001';
end $$;

-- ---- the delete itself ----
do $$
declare r jsonb;
begin
  r := delete_member('13000000-0000-0000-0000-000000000002');

  perform assert('report names who was deleted', r ->> 'deleted_name' = 'Target');
  perform assert('report notes they had a login', (r ->> 'had_login')::boolean);
  perform assert('report carries the auth user id for revocation',
    r ->> 'auth_user_id' = '00000000-0000-0000-0000-0000000000c3');
  perform assert('report counts the signup', (r ->> 'signups')::int = 1);
  perform assert('report counts the balance', (r ->> 'balances')::int = 1);
  perform assert('report surfaces money already paid', (r ->> 'amount_paid')::numeric = 30);
  perform assert('report surfaces money still owed', (r ->> 'amount_owed')::numeric = 80);
  perform assert('report counts relationships in both directions',
    (r ->> 'relationships')::int = 1);
  perform assert('report counts survey responses', (r ->> 'survey_responses')::int = 1);
  perform assert('report counts photos untagged', (r ->> 'photos_untagged')::int = 2);

  perform assert('member row is gone',
    not exists (select 1 from members where id = '13000000-0000-0000-0000-000000000002'));
  perform assert('signup cascaded away',
    not exists (select 1 from signups where member_id = '13000000-0000-0000-0000-000000000002'));
  perform assert('balance cascaded away',
    not exists (select 1 from balances where member_id = '13000000-0000-0000-0000-000000000002'));
  perform assert('relationship cascaded away',
    not exists (select 1 from relationships
      where member_id = '13000000-0000-0000-0000-000000000002'
         or related_member_id = '13000000-0000-0000-0000-000000000002'));
  perform assert('survey response cascaded away',
    not exists (select 1 from survey_responses where member_id = '13000000-0000-0000-0000-000000000002'));
end $$;

-- ---- the bits foreign keys do NOT handle ----
do $$
begin
  perform assert('no photo still tags the deleted member',
    not exists (select 1 from photos
      where '13000000-0000-0000-0000-000000000002'::uuid = any(tagged_members)));
  perform assert('other tags on the same photo survive',
    (select tagged_members from photos where id = '53000000-0000-0000-0000-000000000001')
      = array['13000000-0000-0000-0000-000000000003']::uuid[]);
  perform assert('a tag list emptied by the delete is an empty array, not null',
    (select tagged_members from photos where id = '53000000-0000-0000-0000-000000000002')
      = '{}'::uuid[]);

  -- Authored content is kept, credited to nobody.
  perform assert('their photo upload is kept but uncredited',
    (select uploaded_by from photos where id = '53000000-0000-0000-0000-000000000001') is null);
  perform assert('their chat message is kept but uncredited',
    (select sender_id from messages where id = '63000000-0000-0000-0000-000000000001') is null);
  perform assert('the survey they created survives',
    exists (select 1 from surveys where id = '43000000-0000-0000-0000-000000000001'));
end $$;

do $$
begin
  begin
    perform delete_member('13000000-0000-0000-0000-0000000000ff');
    perform assert('deleting an unknown member is refused', false);
  exception when no_data_found then
    perform assert('deleting an unknown member is refused', true);
  end;
end $$;

\echo ''
\echo '########## ALL DELETE ASSERTIONS PASSED ##########'
