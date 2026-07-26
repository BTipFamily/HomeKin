-- ============================================================
-- Emailing invite codes, and normalizing member email addresses
-- ============================================================

-- ---- Who an invite code was emailed to ----
alter table invite_codes
  add column if not exists sent_to text,
  add column if not exists sent_at timestamptz;

comment on column invite_codes.sent_to is
  'Address the signup link was emailed to, or null when the admin copied the link instead.';

-- ---- Email normalization ----
--
-- members.email is `text unique`, and Postgres compares text case-sensitively,
-- so 'Joe@Gmail.com' and 'joe@gmail.com' are two different rows. Supabase Auth
-- lowercases addresses when an account is created, so a profile added by an
-- admin with any capitalisation could never be matched to its owner at signup —
-- which is how the same person ends up with two profiles.
--
-- Lowercase everything that can be lowercased without colliding. Rows that DO
-- collide are genuine duplicates: leave them alone and let an admin resolve
-- them in Manage Members -> Merge Duplicates, which is built for exactly this.

do $$
declare
  v_normalized integer;
  v_conflicts integer;
begin
  update members m
  set email = lower(m.email)
  where m.email <> lower(m.email)
    and not exists (
      select 1 from members other
      where other.id <> m.id
        and lower(other.email) = lower(m.email)
    );
  get diagnostics v_normalized = row_count;

  select count(*) into v_conflicts
  from (
    select lower(email) from members group by lower(email) having count(*) > 1
  ) dupes;

  raise notice 'Normalized % member email address(es).', v_normalized;
  if v_conflicts > 0 then
    raise notice
      '% address(es) are still held by more than one profile. Merge them under Manage Members -> Merge Duplicates.',
      v_conflicts;
  end if;
end $$;

-- Not unique: the rows this would reject are the duplicates above, and a
-- migration that fails on real data is worse than one that leaves them for the
-- merge tool. The index is here so the case-insensitive lookup at signup stays
-- an index scan.
create index if not exists members_email_lower_idx on members (lower(email));
