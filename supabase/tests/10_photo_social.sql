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
  ('00000000-0000-0000-0000-0000000001a1', 'rose@x.com'),
  ('00000000-0000-0000-0000-0000000001a2', 'sam@x.com'),
  ('00000000-0000-0000-0000-0000000001a3', 'boss@x.com');

insert into members (id, auth_user_id, name, email, role) values
  ('19000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000001a1', 'Rose', 'rose@x.com', 'member'),
  ('19000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000001a2', 'Sam', 'sam@x.com', 'member'),
  ('19000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000001a3', 'Boss', 'boss@x.com', 'admin');

insert into reunions (id, name, year) values
  ('29000000-0000-0000-0000-000000000001', 'Reunion', 2026);

insert into photos (id, reunion_id, uploaded_by, storage_path, caption) values
  ('39000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001',
   '19000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001/one.jpg', 'Grandma'),
  ('39000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000001',
   '19000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000001/two.jpg', null);

-- ---- one like per member per photo ----
do $$
begin
  insert into photo_likes (photo_id, member_id) values
    ('39000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001'),
    ('39000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000002');

  perform assert('two members can like the same photo',
    (select count(*) from photo_likes
      where photo_id = '39000000-0000-0000-0000-000000000001') = 2);

  -- The primary key, not the toggle action, is what makes this true. A double
  -- tap or two open tabs must not be able to inflate a count.
  begin
    insert into photo_likes (photo_id, member_id) values
      ('39000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001');
    perform assert('a member cannot like the same photo twice', false);
  exception when unique_violation then
    perform assert('a member cannot like the same photo twice', true);
  end;
end $$;

-- ---- comments ----
do $$
begin
  insert into photo_comments (id, photo_id, author_id, body) values
    ('49000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001',
     '19000000-0000-0000-0000-000000000002', 'She looks so happy');

  perform assert('a comment is stored against its photo',
    (select count(*) from photo_comments
      where photo_id = '39000000-0000-0000-0000-000000000001') = 1);

  begin
    insert into photo_comments (photo_id, author_id, body) values
      ('39000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000002', '   ');
    perform assert('a whitespace-only comment is rejected', false);
  exception when check_violation then
    perform assert('a whitespace-only comment is rejected', true);
  end;
end $$;

-- ---- what happens to a conversation when people and photos go away ----
do $$
begin
  -- A deleted member's words stay; only the attribution goes.
  delete from members where id = '19000000-0000-0000-0000-000000000002';

  perform assert('deleting a member keeps their comment',
    (select count(*) from photo_comments
      where id = '49000000-0000-0000-0000-000000000001') = 1);
  perform assert('but the comment is no longer attributed',
    (select author_id from photo_comments
      where id = '49000000-0000-0000-0000-000000000001') is null);
  perform assert('deleting a member takes their likes with them',
    (select count(*) from photo_likes
      where member_id = '19000000-0000-0000-0000-000000000002') = 0);
end $$;

do $$
begin
  delete from photos where id = '39000000-0000-0000-0000-000000000001';

  perform assert('deleting a photo takes its comments',
    (select count(*) from photo_comments
      where photo_id = '39000000-0000-0000-0000-000000000001') = 0);
  perform assert('deleting a photo takes its likes',
    (select count(*) from photo_likes
      where photo_id = '39000000-0000-0000-0000-000000000001') = 0);
end $$;

-- ---- merging two people who both liked the same photo ----
-- This is the case that would have aborted the whole merge: moving the source's
-- like onto the target violates the primary key. It only ever shows up when an
-- admin merges two real duplicates, which is exactly when a failure is worst.
do $$
declare v_report jsonb;
begin
  insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000001b1', 'dupe@x.com');
  insert into members (id, auth_user_id, name, email, role) values
    ('19000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000001b1',
     'Rose Dupe', 'dupe@x.com', 'member');

  insert into photo_likes (photo_id, member_id) values
    ('39000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000001'),
    ('39000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000004');

  insert into photo_comments (photo_id, author_id, body) values
    ('39000000-0000-0000-0000-000000000002', '19000000-0000-0000-0000-000000000004', 'From the duplicate');

  set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000001a3';
  v_report := merge_members(
    '19000000-0000-0000-0000-000000000004',
    '19000000-0000-0000-0000-000000000001'
  );

  perform assert('merging two profiles that liked the same photo succeeds',
    (v_report ->> 'merged_into') = '19000000-0000-0000-0000-000000000001');
  perform assert('the duplicate like is dropped, not moved',
    (v_report ->> 'photo_likes_dropped')::int = 1);
  perform assert('one like remains on the photo',
    (select count(*) from photo_likes
      where photo_id = '39000000-0000-0000-0000-000000000002') = 1);
  perform assert('and it belongs to the surviving profile',
    (select member_id from photo_likes
      where photo_id = '39000000-0000-0000-0000-000000000002')
      = '19000000-0000-0000-0000-000000000001');
  perform assert('the duplicate profile''s comment moves to the survivor',
    (select author_id from photo_comments
      where body = 'From the duplicate') = '19000000-0000-0000-0000-000000000001');
end $$;

-- ---- reunion delete sweeps everything below it ----
do $$
begin
  delete from reunions where id = '29000000-0000-0000-0000-000000000001';

  perform assert('deleting a reunion clears its photo likes',
    (select count(*) from photo_likes) = 0);
  perform assert('deleting a reunion clears its photo comments',
    (select count(*) from photo_comments) = 0);
end $$;

\echo ''
\echo '########## ALL PHOTO SOCIAL ASSERTIONS PASSED ##########'
