-- ============================================================
-- Who is actually coming, by name
-- ============================================================
--
-- A signup says a member is coming and brings a headcount, plus `guest_names`
-- — one free-text field holding however many people, however the person typed
-- them. That is enough to count chairs and nothing else. It cannot answer
-- "how many children's meals", "who needs step-free access", "is anyone
-- allergic to shellfish", or "which of these is a two-year-old who does not
-- need a banquet ticket" — all of which the committee has to know before it
-- can order food or price the event honestly.
--
-- Attendees make those people real rows. The headcount stays on the signup as
-- the authoritative number; attendees are the detail behind it, and the two
-- are deliberately not forced to agree — a family that has told you four are
-- coming but only named two should not be blocked from saving.

create table attendees (
  id uuid primary key default uuid_generate_v4(),
  signup_id uuid not null references signups(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- Nullable because the backfill below genuinely does not know it, and
  -- because a family part-way through filling this in should be able to save.
  age_band text check (age_band in ('adult', 'senior', 'teen', 'child', 'toddler')),
  dietary_notes text,
  accessibility_notes text,
  created_at timestamptz not null default now()
);

create index attendees_signup_idx on attendees (signup_id);

-- ---- Backfill from guest_names ----
-- Split on commas, which is how people actually type a list. Names that were
-- there become rows; nothing is invented to pad the count, so a signup for
-- four that named two produces two attendees and a headcount of four. Age band
-- and dietary notes stay null — the old field never held them, and a guess
-- here would be indistinguishable from something the family told us.
--
-- guest_names is deliberately left in place. It stays the source of truth
-- until the UI reads attendees instead, and dropping it in the same migration
-- that introduces the replacement would leave no way back.
insert into attendees (signup_id, name)
select s.id, btrim(part)
from signups s
cross join lateral unnest(string_to_array(s.guest_names, ',')) as part
where s.guest_names is not null
  and btrim(s.guest_names) <> ''
  and btrim(part) <> '';

do $$
declare v_count integer;
begin
  select count(*) into v_count from attendees;
  raise notice 'Backfilled % attendee(s) from guest_names.', v_count;
end $$;

-- ---- RLS ----
-- An attendee is only ever reached through its signup, so the policies mirror
-- the ones on signups: your own, plus committee and admin for everyone's.
alter table attendees enable row level security;

create policy "Attendees: own or committee can view" on attendees
  for select to authenticated
  using (
    get_my_role() in ('committee', 'admin')
    or exists (
      select 1 from signups s
      where s.id = attendees.signup_id and s.member_id = get_my_member_id()
    )
  );

create policy "Attendees: own or committee can add" on attendees
  for insert to authenticated
  with check (
    get_my_role() in ('committee', 'admin')
    or exists (
      select 1 from signups s
      where s.id = attendees.signup_id and s.member_id = get_my_member_id()
    )
  );

create policy "Attendees: own or committee can update" on attendees
  for update to authenticated
  using (
    get_my_role() in ('committee', 'admin')
    or exists (
      select 1 from signups s
      where s.id = attendees.signup_id and s.member_id = get_my_member_id()
    )
  );

create policy "Attendees: own or committee can remove" on attendees
  for delete to authenticated
  using (
    get_my_role() in ('committee', 'admin')
    or exists (
      select 1 from signups s
      where s.id = attendees.signup_id and s.member_id = get_my_member_id()
    )
  );

-- ---- A note on merging ----
-- merge_members needs no change here. Attendees hang off signups, and the
-- merge already drops a source signup that duplicates a target one — on the
-- stated grounds that the same person signed up twice is the bug being fixed,
-- not two separate bookings to combine. Those attendees cascade away with it,
-- which is consistent with that decision rather than an oversight. It is
-- asserted in supabase/tests/12_households_attendees.sql so a future change to
-- either side has to confront it.
