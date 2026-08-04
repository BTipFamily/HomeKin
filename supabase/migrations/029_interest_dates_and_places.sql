-- ============================================================
-- When could you come, and where would you like it?
-- ============================================================
--
-- The interest form asks which months work. That is enough to rule out
-- February and nothing else: "July" does not tell a committee whether the
-- first weekend or the last is the one that lets the most families travel, and
-- those are entirely different reunions for anybody booking flights.
--
-- Families answer in ranges, because that is how they actually know their own
-- availability — "any time between the 12th and the 19th", "the last weekend
-- in August". Overlapping those ranges is what produces a shortlist of real
-- candidate weekends, which is the question the committee is stuck on.
--
-- preferred_months stays. A family that genuinely only knows "sometime in
-- summer" must still be able to answer without inventing precision.

create table interest_date_ranges (
  id uuid primary key default uuid_generate_v4(),
  response_id uuid not null references interest_responses(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  -- A single day is a legitimate answer, so this is >= rather than >.
  check (ends_on >= starts_on)
);

create index interest_date_ranges_response_idx on interest_date_ranges (response_id);

-- A child table rather than an array column so the range is constrainable and
-- the overlap maths gets clean input. Nothing else in this schema needs to
-- query inside it, so the join cost is a non-issue.

alter table interest_responses
  -- Free text, deliberately. Asking families to pick from a list the committee
  -- wrote means the place nobody on the committee thought of never gets named,
  -- and that is the main thing this question is for. The dashboard normalises
  -- and ranks them; the committee promotes the good ones to a real shortlist.
  add column suggested_locations text[] not null default '{}',
  add column food_preferences text[] not null default '{}';

-- Constrained the way preferred_months already is: a value outside the set is
-- a bug in the form, not something to store and puzzle over later.
alter table interest_responses
  add constraint interest_responses_food_valid
  check (
    food_preferences <@ array['catered', 'potluck', 'cookout', 'restaurant', 'mixed']
  );

comment on column interest_responses.suggested_locations is
  'Places the family named, as typed. Normalised for counting in src/lib/interest-summary.ts, never on write.';

-- ---- RLS ----
-- A date range is part of its response and is reached only through it, so the
-- policies mirror interest_responses exactly: your own, plus committee.
alter table interest_date_ranges enable row level security;

create policy "InterestDateRanges: own or committee can view" on interest_date_ranges
  for select to authenticated
  using (
    get_my_role() in ('committee', 'admin')
    or exists (
      select 1 from interest_responses r
      where r.id = interest_date_ranges.response_id and r.member_id = get_my_member_id()
    )
  );

create policy "InterestDateRanges: own or committee can add" on interest_date_ranges
  for insert to authenticated
  with check (
    get_my_role() in ('committee', 'admin')
    or exists (
      select 1 from interest_responses r
      where r.id = interest_date_ranges.response_id and r.member_id = get_my_member_id()
    )
  );

create policy "InterestDateRanges: own or committee can remove" on interest_date_ranges
  for delete to authenticated
  using (
    get_my_role() in ('committee', 'admin')
    or exists (
      select 1 from interest_responses r
      where r.id = interest_date_ranges.response_id and r.member_id = get_my_member_id()
    )
  );

-- merge_members needs no change: date ranges hang off the response, and the
-- response is already folded by merge_dedup_move, which takes its ranges with
-- it or drops them alongside the duplicate answer.
