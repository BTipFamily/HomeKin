\set ON_ERROR_STOP on
\timing off

-- ============================================================
-- Fixture: the exact situation described — Jane was added to the
-- directory by an admin, then signed up with an invite code under a
-- different address and got a second profile.
-- ============================================================

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'jane.new@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'bob@example.com');

-- admin (the actor)
insert into members (id, auth_user_id, name, email, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Admin', 'admin@example.com', 'admin');

-- TARGET: the long-standing directory profile (no login yet)
insert into members (id, name, email, phone, family_branch, bio, created_by_proxy, role, date_of_birth, social_links)
values ('10000000-0000-0000-0000-000000000002', 'Jane Smith', 'jane@example.com', '555-1111', 'Smith', null, true, 'member', '1980-04-01',
        '{"facebook": "fb/jane", "instagram": null, "linkedin": null}');

-- SOURCE: the duplicate created by the invite-code signup (has the login)
insert into members (id, auth_user_id, name, email, phone, address, bio, created_by_proxy, role, social_links)
values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a2', 'Jane Smith', 'jane.new@example.com', null, '9 Oak St', 'Loves gardening.', false, 'committee',
        '{"facebook": "fb/other", "instagram": "ig/jane", "linkedin": null}');

-- a third person, to exercise relationship dedupe
insert into members (id, auth_user_id, name, email, role) values
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a3', 'Bob Smith', 'bob@example.com', 'member');

insert into reunions (id, name, year) values ('20000000-0000-0000-0000-000000000001', 'Smith Reunion', 2026);
insert into sub_events (id, reunion_id, name, date) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Picnic', '2026-08-01'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Banquet', '2026-08-02'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Golf', '2026-08-03');

-- Signups: BOTH signed up for the Picnic (source confirmed, target pending)
--          only the source signed up for the Banquet
insert into signups (sub_event_id, member_id, headcount, status) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 2, 'pending'),
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 1, 'confirmed'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 3, 'pending');

-- Balances: no overlap (target owes for Picnic, source for Banquet)
insert into balances (member_id, reunion_id, sub_event_id, amount_owed, amount_paid, status) values
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 50, 50, 'paid'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 75, 0, 'unpaid');

-- Relationships:
--   (a) source and target are recorded as PARTNERS of each other -> self-edge
--   (b) both are recorded as a parent of Bob                     -> duplicate
--   (c) source alone has a custom edge to Bob                    -> plain move
insert into relationships (member_id, related_member_id, relationship_type, partner_status) values
  ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'partner', 'married');
insert into relationships (member_id, related_member_id, relationship_type, parent_child_kind) values
  ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'parent_child', 'biological'),
  ('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'parent_child', 'biological');
insert into relationships (member_id, related_member_id, relationship_type, custom_label) values
  ('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'custom', 'godparent');
-- an inbound edge too: Bob is recorded as a parent of the source
insert into relationships (member_id, related_member_id, relationship_type, parent_child_kind, created_by) values
  ('10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 'parent_child', 'step', '10000000-0000-0000-0000-000000000003');

-- Surveys: both answered survey 1 (target's answers must win), source alone answered survey 2
insert into surveys (id, reunion_id, title, questions, created_by) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Menu', '[]', '10000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Dates', '[]', '10000000-0000-0000-0000-000000000001');
insert into survey_responses (survey_id, member_id, answers) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '{"keep":"target"}'),
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', '{"keep":"source"}'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '{"only":"source"}');

-- Photos: tagged_members array holds both ids on one photo, source only on another
insert into photos (id, reunion_id, uploaded_by, storage_path, tagged_members) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'a.jpg',
   array['10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004']::uuid[]),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'b.jpg',
   array['10000000-0000-0000-0000-000000000003']::uuid[]);

-- Misc ownership rows
insert into announcements (reunion_id, title, body, created_by) values
  ('20000000-0000-0000-0000-000000000001', 'Hi', 'Body', '10000000-0000-0000-0000-000000000003');
insert into messages (reunion_id, sender_id, body) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'hello');
insert into invitations (reunion_id, member_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003');
insert into invite_codes (code, created_by, used_by, used_at) values
  ('ABC123', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', now());
insert into reunion_timeline_items (reunion_id, title, due_date, created_by) values
  ('20000000-0000-0000-0000-000000000001', 'Book venue', '2026-05-01', '10000000-0000-0000-0000-000000000003');

\echo '=========== BEFORE ==========='
select id, name, email, role, auth_user_id is not null as has_login, created_by_proxy, phone, address, date_of_birth
from members where id in ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003') order by id;

-- ============================================================
-- Act as the admin and merge source (…003) into target (…002)
-- ============================================================
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';

\echo '=========== MERGE REPORT ==========='
select jsonb_pretty(merge_members(
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000002'
));
