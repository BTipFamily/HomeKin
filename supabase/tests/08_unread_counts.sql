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
  ('00000000-0000-0000-0000-0000000000f1', 'me@x.com'),
  ('00000000-0000-0000-0000-0000000000f2', 'other@x.com');

insert into members (id, auth_user_id, name, email, role) values
  ('16000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'Me', 'me@x.com', 'member'),
  ('16000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f2', 'Other', 'other@x.com', 'member');

insert into reunions (id, name, year) values
  ('26000000-0000-0000-0000-000000000001', 'R1', 2026),
  ('26000000-0000-0000-0000-000000000002', 'R2', 2027);
insert into sub_events (id, reunion_id, name, date) values
  ('36000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', 'Picnic', '2026-08-01');

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';

do $$
begin
  perform assert('an empty app has nothing unread',
    (select count(*) from my_unread_counts()) = 0);
end $$;

-- Someone else posts in the reunion chat and the event chat.
insert into messages (reunion_id, sub_event_id, sender_id, body) values
  ('26000000-0000-0000-0000-000000000001', null, '16000000-0000-0000-0000-000000000002', 'hello'),
  ('26000000-0000-0000-0000-000000000001', null, '16000000-0000-0000-0000-000000000002', 'again'),
  ('26000000-0000-0000-0000-000000000001', '36000000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000002', 'about the picnic');

do $$
begin
  perform assert('messages from others count as unread with no receipt',
    (select chat_unread from my_unread_counts()
      where reunion_id = '26000000-0000-0000-0000-000000000001') = 3);
end $$;

-- My own message must never count against me.
insert into messages (reunion_id, sub_event_id, sender_id, body) values
  ('26000000-0000-0000-0000-000000000001', null, '16000000-0000-0000-0000-000000000001', 'my reply');

do $$
begin
  perform assert('my own message is not unread to me',
    (select chat_unread from my_unread_counts()
      where reunion_id = '26000000-0000-0000-0000-000000000001') = 3);
end $$;

-- Reading the reunion-wide chat clears only that channel.
insert into read_receipts (member_id, reunion_id, channel, sub_event_id, last_read_at) values
  ('16000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', 'chat', null, now());

do $$
begin
  perform assert('reading the main chat leaves the event chat unread',
    (select chat_unread from my_unread_counts()
      where reunion_id = '26000000-0000-0000-0000-000000000001') = 1);
end $$;

insert into read_receipts (member_id, reunion_id, channel, sub_event_id, last_read_at) values
  ('16000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001', 'chat',
   '36000000-0000-0000-0000-000000000001', now());

do $$
begin
  perform assert('reading the event chat too clears the reunion',
    coalesce((select chat_unread from my_unread_counts()
      where reunion_id = '26000000-0000-0000-0000-000000000001'), 0) = 0);
end $$;

-- A later message reopens it.
insert into messages (reunion_id, sub_event_id, sender_id, body, created_at) values
  ('26000000-0000-0000-0000-000000000001', null, '16000000-0000-0000-0000-000000000002', 'later', now() + interval '1 minute');

do $$
begin
  perform assert('a message after the receipt is unread again',
    (select chat_unread from my_unread_counts()
      where reunion_id = '26000000-0000-0000-0000-000000000001') = 1);
end $$;

-- ---- announcements ----
insert into announcements (reunion_id, title, body, created_by) values
  ('26000000-0000-0000-0000-000000000001', 'Theirs', 'x', '16000000-0000-0000-0000-000000000002'),
  ('26000000-0000-0000-0000-000000000001', 'Mine', 'x', '16000000-0000-0000-0000-000000000001');

do $$
begin
  perform assert('announcements count separately from chat',
    (select announcements_unread from my_unread_counts()
      where reunion_id = '26000000-0000-0000-0000-000000000001') = 1);
  perform assert('chat count is unaffected by announcements',
    (select chat_unread from my_unread_counts()
      where reunion_id = '26000000-0000-0000-0000-000000000001') = 1);
end $$;

-- ---- reunions are counted independently ----
insert into messages (reunion_id, sender_id, body) values
  ('26000000-0000-0000-0000-000000000002', '16000000-0000-0000-0000-000000000002', 'other reunion');

do $$
begin
  perform assert('a second reunion gets its own row',
    (select chat_unread from my_unread_counts()
      where reunion_id = '26000000-0000-0000-0000-000000000002') = 1);
  perform assert('two reunions have unread items',
    (select count(*) from my_unread_counts()) = 2);
end $$;

-- ---- a reunion with only announcements still appears ----
insert into announcements (reunion_id, title, body, created_by) values
  ('26000000-0000-0000-0000-000000000002', 'Only a post', 'x', '16000000-0000-0000-0000-000000000002');

do $$
begin
  perform assert('the full outer join keeps announcement-only reunions',
    (select announcements_unread from my_unread_counts()
      where reunion_id = '26000000-0000-0000-0000-000000000002') = 1);
end $$;

-- ---- each member sees only their own state ----
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
do $$
begin
  -- Everything above was written by Other, so almost nothing is unread to them
  -- — but my own reply is.
  perform assert('the other member sees only what they did not write',
    (select chat_unread from my_unread_counts()
      where reunion_id = '26000000-0000-0000-0000-000000000001') = 1);
  perform assert('and only announcements they did not write',
    (select announcements_unread from my_unread_counts()
      where reunion_id = '26000000-0000-0000-0000-000000000001') = 1);
end $$;

\echo ''
\echo '########## ALL UNREAD COUNT ASSERTIONS PASSED ##########'
