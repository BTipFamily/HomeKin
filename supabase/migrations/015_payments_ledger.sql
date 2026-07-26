-- ============================================================
-- Payment history: one row per payment, not one number per balance
-- ============================================================
--
-- balances.amount_paid was a single mutable figure that every payment path
-- overwrote:
--
--   * the Stripe webhook set it to the amount of that checkout session, so a
--     $40 manual payment followed by a $60 card payment on a $100 balance left
--     the record saying $60;
--   * confirming a manual payment set it to amount_owed, erasing any partial
--     payment that came before.
--
-- Neither was recoverable, because nothing recorded when a payment happened,
-- which method it used, or who took it. That also made "what has this member
-- paid for?" a question the schema simply could not answer.
--
-- Payments now live in their own table and balances.amount_paid is derived
-- from it by trigger. Both bugs stop being expressible rather than being
-- patched, partial payments work, and history falls out for free.

create table payments (
  id uuid primary key default uuid_generate_v4(),
  balance_id uuid not null references balances(id) on delete cascade,
  -- Denormalized so the member and reunion reports stay single-table scans and
  -- survive as filters even when a balance is being recalculated.
  member_id uuid not null references members(id) on delete cascade,
  reunion_id uuid not null references reunions(id) on delete cascade,

  -- Negative amounts are refunds, which is why this is <> 0 rather than > 0.
  amount numeric(10, 2) not null check (amount <> 0),
  method text not null check (method in ('stripe', 'zelle', 'cashapp', 'check', 'other')),
  -- 'pending' is a member saying they have paid; 'confirmed' is the committee
  -- agreeing. Only confirmed rows count toward the balance.
  status text not null default 'confirmed' check (status in ('pending', 'confirmed')),

  paid_at timestamptz not null default now(),
  note text,
  -- Unique, so a replayed Stripe webhook cannot double-count a payment. This
  -- is the idempotency guarantee, enforced by the database rather than by
  -- remembering to check.
  stripe_session_id text unique,
  recorded_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index payments_balance_id_idx on payments (balance_id);
create index payments_member_id_idx on payments (member_id);
create index payments_reunion_id_idx on payments (reunion_id);
create index payments_paid_at_idx on payments (paid_at desc);

-- ---- Deriving the balance from the ledger ----

-- Status is a function of what is owed and what has been confirmed, so it is
-- computed here rather than trusted from whatever the caller passed in.
create or replace function balances_derive_status()
returns trigger
language plpgsql
as $$
declare
  v_pending integer;
begin
  select count(*) into v_pending
  from payments
  where balance_id = new.id and status = 'pending';

  if new.amount_paid >= new.amount_owed then
    new.status := 'paid';
  elsif v_pending > 0 then
    new.status := 'pending_confirmation';
  elsif new.amount_paid > 0 then
    new.status := 'partially_paid';
  else
    new.status := 'unpaid';
  end if;

  return new;
end;
$$;

create trigger balances_derive_status_trg
  before insert or update of amount_owed, amount_paid on balances
  for each row execute function balances_derive_status();

/**
 * Recomputes a balance from its confirmed payments.
 *
 * Always writes amount_paid even when the total is unchanged: the write is
 * what fires balances_derive_status, which is how a newly pending payment
 * moves the balance to 'pending_confirmation' without changing any amount.
 */
create or replace function recalc_balance(p_balance uuid)
returns void
language plpgsql
as $$
begin
  update balances b
  set amount_paid = coalesce(
    (select sum(p.amount) from payments p
      where p.balance_id = b.id and p.status = 'confirmed'),
    0
  )
  where b.id = p_balance;
end;
$$;

create or replace function payments_sync_balance()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.balance_id is distinct from new.balance_id then
    perform recalc_balance(old.balance_id);
  end if;
  perform recalc_balance(coalesce(new.balance_id, old.balance_id));
  return null;
end;
$$;

create trigger payments_sync_balance_trg
  after insert or update or delete on payments
  for each row execute function payments_sync_balance();

-- ---- Backfill ----
-- Everything already recorded becomes a single ledger entry so no existing
-- figure changes and no history is invented that we cannot stand behind.

insert into payments (balance_id, member_id, reunion_id, amount, method, status, paid_at, note)
select
  b.id,
  b.member_id,
  b.reunion_id,
  b.amount_paid,
  coalesce(b.payment_method, 'other'),
  'confirmed',
  b.updated_at,
  'Recorded before payment history existed; exact date and method may be approximate.'
from balances b
where b.amount_paid > 0;

-- Balances a member had reported as paid but nobody had confirmed yet.
insert into payments (balance_id, member_id, reunion_id, amount, method, status, paid_at, note)
select
  b.id,
  b.member_id,
  b.reunion_id,
  b.amount_owed,
  coalesce(b.payment_method, 'other'),
  'pending',
  b.updated_at,
  'Reported by the member before payment history existed; amount assumed to be the full balance.'
from balances b
where b.status = 'pending_confirmation'
  and b.amount_paid = 0
  and b.amount_owed > 0;

do $$
declare v_count integer;
begin
  select count(*) into v_count from payments;
  raise notice 'Backfilled % payment record(s) from existing balances.', v_count;
end $$;

-- ---- RLS ----

alter table payments enable row level security;

create policy "Payments: members can view their own" on payments
  for select to authenticated
  using (member_id = get_my_member_id() or get_my_role() in ('committee', 'admin'));

-- A member reporting that they have paid. Constrained to their own balances
-- and to 'pending', so nobody can mark themselves settled.
create policy "Payments: members can report their own" on payments
  for insert to authenticated
  with check (
    member_id = get_my_member_id()
    and status = 'pending'
    and stripe_session_id is null
  );

create policy "Payments: committee can record" on payments
  for insert to authenticated
  with check (get_my_role() in ('committee', 'admin'));

create policy "Payments: committee can update" on payments
  for update to authenticated
  using (get_my_role() in ('committee', 'admin'));

create policy "Payments: committee can delete" on payments
  for delete to authenticated
  using (get_my_role() in ('committee', 'admin'));
