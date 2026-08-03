-- ============================================================
-- What stage is this reunion at?
-- ============================================================
--
-- Every feature in HomeKin is on from the moment a reunion is created. A
-- family visiting a reunion that has no date yet sees the same signup and
-- payment pages as one happening next week, and nothing anywhere says which
-- situation they are in. The organiser has no way to say "we are still working
-- out when and where" other than by telling everyone individually.
--
-- A reunion now moves through stages. This is deliberately a *soft* signal:
-- the column drives what the app surfaces and what it nudges people toward,
-- and does not lock pages. Hard gating is a good way for an organiser to shut
-- the family out of something they needed, and the failure mode of a page that
-- is merely quiet is much kinder than one that refuses.

alter table reunions
  add column status text not null default 'planning'
    check (status in ('draft', 'interest', 'planning', 'registration', 'finalized', 'completed'));

-- Existing reunions default to 'planning' rather than 'draft': they are real,
-- in use, and have people signed up. Starting them at 'draft' would describe
-- live reunions as unpublished. Ones with a date already in the past are a
-- better fit for 'completed', so they are moved there.
update reunions
set status = 'completed'
where end_date is not null and end_date < current_date
   or (end_date is null and start_date is not null and start_date < current_date);

comment on column reunions.status is
  'Lifecycle stage. Advisory: it drives what the app surfaces and suggests, not what it permits.';

create index reunions_status_idx on reunions (status);
