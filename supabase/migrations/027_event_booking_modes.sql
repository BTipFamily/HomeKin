-- ============================================================
-- Not every event is booked the same way
-- ============================================================
--
-- Every event in HomeKin is implicitly one kind: the committee sets a price,
-- members sign up, HomeKin bills them. There is no discriminator on the table
-- at all — "does this cost money" is inferred from `cost_per_person > 0` in
-- seven different places.
--
-- Real reunions are not like that. A boat tour, a museum, a ballgame: the
-- family books and pays on the vendor's own site and the committee's only job
-- is knowing who is going. And a group booking is different again — the vendor
-- drops the rate once enough people commit, so what a family owes depends on
-- how many other families have signed up. Neither was expressible, and both
-- ended up in a spreadsheet next to the app.
--
-- Three modes:
--   homekin — the committee collects. Today's behaviour, and the default.
--   direct  — the vendor collects. HomeKin records who is going and what it
--             costs them, and deliberately creates no balance: claiming money
--             the committee is not holding would make the budget page lie.
--   group   — the committee collects, at a price that falls as the headcount
--             crosses the tiers below.

alter table sub_events
  -- Defaulting to 'homekin' backfills every existing event correctly, so there
  -- is no data migration and no window where an event's mode is unknown.
  add column booking_mode text not null default 'homekin'
    check (booking_mode in ('homekin', 'direct', 'group')),

  -- Where a direct booking is actually made. Free text and a URL rather than a
  -- vendors table: one name and one link is what an event needs, and a vendor
  -- directory is a different feature.
  add column vendor_name text,
  add column vendor_url text,

  -- "Book by" — the vendor's cut-off, which is usually earlier than the event
  -- and is the thing families miss.
  add column booking_deadline date,

  -- The vendor's "we need at least N or it does not run". Advisory: it drives
  -- a warning, never a refusal, because these get negotiated and a committee
  -- that is one person short should not be blocked by its own software.
  add column min_group_size integer check (min_group_size is null or min_group_size >= 1);

alter table signups
  -- The vendor's confirmation number, as reported by the member. Proof for the
  -- committee that a direct booking really happened.
  add column booking_reference text,
  -- What the member says they paid the vendor. Recorded for the family's own
  -- picture of what the weekend cost; it never enters the payments ledger,
  -- because that money never passed through the committee.
  add column external_amount numeric(10, 2)
    check (external_amount is null or external_amount >= 0);

comment on column sub_events.booking_mode is
  'homekin = committee collects; direct = vendor collects, no balance is created; group = committee collects at a tiered price.';
comment on column signups.external_amount is
  'Reported spend at an external vendor. Never part of balances or payments.';

-- ---- Group pricing tiers ----
-- A tier is "at N people or more, the price per person is X". The event's own
-- cost_per_person stays the undiscounted rate, so tiers only ever reduce it and
-- an event with no tiers behaves exactly as it does today.
create table event_price_tiers (
  id uuid primary key default uuid_generate_v4(),
  sub_event_id uuid not null references sub_events(id) on delete cascade,
  min_headcount integer not null check (min_headcount >= 1),
  price_per_person numeric(10, 2) not null check (price_per_person >= 0),
  created_at timestamptz not null default now(),
  -- One price per threshold. Two rows claiming a different rate at the same
  -- headcount is a question with no answer, so it cannot be stored.
  unique (sub_event_id, min_headcount)
);

create index event_price_tiers_event_idx on event_price_tiers (sub_event_id, min_headcount);

-- ---- RLS ----
-- Tiers mirror sub_events: everyone signed in can read them, because the point
-- of a group discount is that people can see it and go and recruit for it.
alter table event_price_tiers enable row level security;

create policy "EventPriceTiers: authenticated can view" on event_price_tiers
  for select to authenticated using (true);

create policy "EventPriceTiers: committee can manage" on event_price_tiers
  for all to authenticated
  using (get_my_role() in ('committee', 'admin'))
  with check (get_my_role() in ('committee', 'admin'));

-- ---- Reading a total headcount ----
--
-- The signups select policy is "members see their own; committee/admin see
-- all". That is right for privacy and wrong for arithmetic: a member cannot
-- read how many people have signed up for an event, which is exactly the
-- number a group discount depends on and the number the capacity check needs.
--
-- Today upsertSignup asks the RLS-bound client for other members' signups and
-- gets nothing back, so the capacity check silently passes for everyone except
-- the committee. This function is the fix: security definer, so it sees the
-- whole table, and it returns only a count — no names, no member ids, nothing
-- the caller could not already infer from a "12 of 20 spots taken" badge.
create or replace function event_headcount(p_sub_event uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(headcount), 0)::integer
  from signups
  where sub_event_id = p_sub_event;
$$;

comment on function event_headcount(uuid) is
  'Total people signed up for an event. security definer because the signups select policy hides other members'' rows, which would otherwise make capacity checks and group pricing read as zero.';

revoke execute on function event_headcount(uuid) from public;
grant execute on function event_headcount(uuid) to authenticated;

-- Same problem, plural: the events list needs a count for every event at once
-- rather than a round trip each.
create or replace function event_headcounts(p_reunion uuid)
returns table (sub_event_id uuid, headcount integer)
language sql
security definer
set search_path = public
stable
as $$
  select se.id, coalesce(sum(s.headcount), 0)::integer
  from sub_events se
  left join signups s on s.sub_event_id = se.id
  where se.reunion_id = p_reunion
  group by se.id;
$$;

revoke execute on function event_headcounts(uuid) from public;
grant execute on function event_headcounts(uuid) to authenticated;
