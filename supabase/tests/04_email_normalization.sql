\set ON_ERROR_STOP on

-- Migration 012 lowercases member emails so a signup can find the profile that
-- was added for it. The risk is the backfill hitting rows that only differ by
-- case: those are real duplicates and lowercasing both would violate the unique
-- constraint and abort the whole migration. This checks it degrades safely.

create or replace function assert(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

-- Wipe anything the earlier fixtures left behind.
delete from members;

insert into members (id, name, email, created_by_proxy) values
  -- normalizable: no other row shares this address
  ('12000000-0000-0000-0000-000000000001', 'Mixed Case', 'Joe@Gmail.com', true),
  -- already lowercase: untouched
  ('12000000-0000-0000-0000-000000000002', 'Already Fine', 'ann@example.com', true),
  -- a colliding pair: lowercasing the first would clash with the second
  ('12000000-0000-0000-0000-000000000003', 'Dupe Upper', 'Sam@Example.com', true),
  ('12000000-0000-0000-0000-000000000004', 'Dupe Lower', 'sam@example.com', false);

-- Re-run the backfill exactly as the migration defines it.
update members m
set email = lower(m.email)
where m.email <> lower(m.email)
  and not exists (
    select 1 from members other
    where other.id <> m.id
      and lower(other.email) = lower(m.email)
  );

do $$
begin
  perform assert('a safely normalizable address is lowercased',
    (select email from members where id = '12000000-0000-0000-0000-000000000001')
      = 'joe@gmail.com');

  perform assert('an already-lowercase address is untouched',
    (select email from members where id = '12000000-0000-0000-0000-000000000002')
      = 'ann@example.com');

  perform assert('a colliding address is left alone rather than aborting',
    (select email from members where id = '12000000-0000-0000-0000-000000000003')
      = 'Sam@Example.com');

  perform assert('nobody is lost to the backfill',
    (select count(*) from members) = 4);

  perform assert('the collision is still findable as a duplicate to merge',
    (select count(*) from (
      select lower(email) from members group by lower(email) having count(*) > 1
    ) d) = 1);
end $$;

-- The lookup the signup path relies on now works for the normalized row.
do $$
begin
  perform assert('signup can now claim the previously mixed-case profile',
    exists (
      select 1 from members
      where email = 'joe@gmail.com'
        and created_by_proxy = true
        and auth_user_id is null
    ));
end $$;

-- The supporting index exists and is usable.
do $$
begin
  perform assert('lower(email) index exists',
    exists (select 1 from pg_indexes where indexname = 'members_email_lower_idx'));
end $$;

\echo ''
\echo '########## ALL EMAIL NORMALIZATION ASSERTIONS PASSED ##########'
