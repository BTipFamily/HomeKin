-- ============================================================
-- Date of birth on member profiles
-- ============================================================

alter table members
  add column if not exists date_of_birth date;

-- Guard against typos that would otherwise land silently in the directory.
alter table members
  drop constraint if exists members_date_of_birth_range;
alter table members
  add constraint members_date_of_birth_range
  check (
    date_of_birth is null
    or (date_of_birth >= date '1900-01-01' and date_of_birth <= current_date)
  );

-- A birth date is at least as sensitive as a phone number, so it joins the
-- per-member visibility settings rather than being unconditionally public.
alter table members
  alter column visibility_settings
  set default '{"phone": "members", "address": "members", "email": "members", "date_of_birth": "members"}';

-- Backfill rows written before the key existed. Existing members keep whatever
-- they had for the other three fields.
update members
set visibility_settings = visibility_settings || '{"date_of_birth": "members"}'::jsonb
where not (visibility_settings ? 'date_of_birth');

-- Birthday lookups ("who has a birthday during the reunion?") scan the whole
-- directory, so index the column for the members that have one.
create index if not exists members_date_of_birth_idx
  on members (date_of_birth)
  where date_of_birth is not null;
