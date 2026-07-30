-- ============================================================
-- Payment deadlines: when the money is due, not just how much
-- ============================================================
--
-- sub_events.cost_per_person says what an event costs and balances says what a
-- member owes, but nothing said *when*. A committee planning a reunion works to
-- checkpoints — a deposit in March, half by May, the balance by July — and
-- without them there is nothing to chase against and no warning to send before
-- a due date arrives.
--
-- Deadlines belong to the event, so everyone who signs up inherits the same
-- checkpoints, prorated by their headcount.
--
-- What each member owes by each date is deliberately NOT stored. It is
-- event_deadlines x their balance, computed on read (see
-- src/lib/payment-schedule.ts). Storing it would drift the moment a headcount
-- changes or an event is repriced — the same class of bug that migration 015
-- removed from balances.amount_paid, and not one worth reintroducing one table
-- over.

create table event_deadlines (
  id uuid primary key default uuid_generate_v4(),
  sub_event_id uuid not null references sub_events(id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  due_date date not null,

  -- How much must be paid by this date:
  --   percent          — amount_value % of what the member owes for the event
  --   fixed_per_person — amount_value dollars x headcount
  --   remainder        — whatever the earlier checkpoints left
  amount_type text not null
    check (amount_type in ('percent', 'fixed_per_person', 'remainder')),

  -- Null exactly when the type is 'remainder', which carries no figure of its
  -- own. Written as an equivalence so neither half can drift from the other.
  amount_value numeric(10, 2)
    check ((amount_type = 'remainder') = (amount_value is null)),

  -- Days before due_date to email a reminder; one send per offset, so
  -- '{14, 3}' means a fortnight's warning and a final nudge. An empty array
  -- means this checkpoint is silent.
  reminder_offsets integer[] not null default '{14, 3}'
    check (0 <= all (reminder_offsets) and array_position(reminder_offsets, null) is null),

  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- A percentage over 100 is a typo, not a plan.
alter table event_deadlines add constraint event_deadlines_percent_range
  check (amount_type <> 'percent' or (amount_value > 0 and amount_value <= 100));

alter table event_deadlines add constraint event_deadlines_fixed_positive
  check (amount_type <> 'fixed_per_person' or amount_value > 0);

-- Two checkpoints on the same day is always a mistake, and merging them by hand
-- afterwards means working out which reminders already went out.
create unique index event_deadlines_unique_date on event_deadlines (sub_event_id, due_date);

-- 'remainder' means "everything still outstanding", so a second one would
-- always be zero.
create unique index event_deadlines_one_remainder on event_deadlines (sub_event_id)
  where amount_type = 'remainder';

create index event_deadlines_sub_event_idx on event_deadlines (sub_event_id);
create index event_deadlines_due_date_idx on event_deadlines (due_date);

-- ============================================================
-- Which emails have already gone out
-- ============================================================
--
-- The reminder job runs daily and is expected to be re-run — a deploy, a
-- retry, a manual invocation while debugging. Dedupe is a unique index rather
-- than a check-then-send, for the same reason payments.stripe_session_id is:
-- two runs racing each other still produce one email.

create table email_sends (
  id uuid primary key default uuid_generate_v4(),
  kind text not null check (kind in ('statement', 'deadline_reminder', 'payment_receipt')),
  member_id uuid not null references members(id) on delete cascade,
  reunion_id uuid not null references reunions(id) on delete cascade,

  -- Set for deadline_reminder: which checkpoint, and which reminder in its
  -- series. Null for the other kinds.
  deadline_id uuid references event_deadlines(id) on delete cascade,
  offset_days integer,

  -- Set for payment_receipt: the payment being acknowledged.
  payment_id uuid references payments(id) on delete cascade,

  sent_at timestamptz not null default now()
);

-- Each kind carries the reference it is keyed on, so a row cannot claim to be
-- a reminder without saying which one.
alter table email_sends add constraint email_sends_reminder_keyed
  check (kind <> 'deadline_reminder' or (deadline_id is not null and offset_days is not null));

alter table email_sends add constraint email_sends_receipt_keyed
  check (kind <> 'payment_receipt' or payment_id is not null);

-- The dedupe guarantees. Partial and explicit rather than one wide index
-- relying on NULLs comparing as distinct, which is true in Postgres but too
-- subtle to rest a "do not email people twice" promise on.
create unique index email_sends_reminder_once
  on email_sends (member_id, deadline_id, offset_days)
  where kind = 'deadline_reminder';

create unique index email_sends_receipt_once
  on email_sends (payment_id)
  where kind = 'payment_receipt';

-- Statements are intentionally not deduped: every change to a member's
-- selections should produce a fresh one. The rows are kept as an audit trail of
-- what we sent and when.
create index email_sends_member_idx on email_sends (member_id, sent_at desc);
create index email_sends_reunion_idx on email_sends (reunion_id, sent_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table event_deadlines enable row level security;

-- Members need to see the checkpoints to know when to pay.
create policy "EventDeadlines: authenticated users can view" on event_deadlines
  for select to authenticated using (true);

create policy "EventDeadlines: committee/admin can create" on event_deadlines
  for insert to authenticated
  with check (get_my_role() in ('committee', 'admin'));

create policy "EventDeadlines: committee/admin can update" on event_deadlines
  for update to authenticated
  using (get_my_role() in ('committee', 'admin'));

create policy "EventDeadlines: committee/admin can delete" on event_deadlines
  for delete to authenticated
  using (get_my_role() in ('committee', 'admin'));

-- email_sends is bookkeeping for the mailer. No policies are created, so with
-- RLS enabled the anon and authenticated roles can reach nothing here and only
-- the service role — which bypasses RLS — can read or write it.
alter table email_sends enable row level security;
