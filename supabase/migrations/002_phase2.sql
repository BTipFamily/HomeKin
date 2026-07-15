-- ============================================================
-- Phase 2: unique constraint + RLS additions
-- ============================================================

-- Allow balances to be upserted per (member, sub_event)
-- NULL sub_event_id rows (general fund) are excluded via partial index
create unique index if not exists balances_member_sub_event_unique
  on balances (member_id, sub_event_id)
  where sub_event_id is not null;

-- Members need to mark their own invitations as responded
create policy "Invitations: member can mark responded"
  on invitations for update to authenticated
  using (member_id = get_my_member_id())
  with check (member_id = get_my_member_id());

-- Balances: members can update their own (to self-report payment method)
-- Committee/admin already have update via existing policy.
-- We restrict which columns members can touch via application logic; RLS
-- only controls row access.
create policy "Balances: members can update own pending balance"
  on balances for update to authenticated
  using (
    member_id = get_my_member_id()
    and status not in ('paid')
  )
  with check (member_id = get_my_member_id());
