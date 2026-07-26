-- ============================================================
-- Knowing who is around, and what you have not read yet
-- ============================================================

-- ---- Presence ----
-- Refreshed by a heartbeat from the browser while a tab is open. This is
-- "recently active", not true presence: there is no disconnect signal, so a
-- closed laptop simply stops refreshing and ages out of the active window.
alter table members
  add column if not exists last_seen_at timestamptz;

create index if not exists members_last_seen_at_idx
  on members (last_seen_at desc)
  where last_seen_at is not null;

-- ---- Read receipts ----
create table read_receipts (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members(id) on delete cascade,
  reunion_id uuid not null references reunions(id) on delete cascade,
  channel text not null check (channel in ('chat', 'announcements')),
  -- Set for an event's own chat, null for the reunion-wide one.
  sub_event_id uuid references sub_events(id) on delete cascade,
  last_read_at timestamptz not null default now()
);

-- A primary key cannot span a nullable column, so uniqueness is split in two
-- the same way the balances table already handles its optional sub_event_id.
create unique index read_receipts_event_unique
  on read_receipts (member_id, sub_event_id, channel)
  where sub_event_id is not null;

create unique index read_receipts_reunion_unique
  on read_receipts (member_id, reunion_id, channel)
  where sub_event_id is null;

create index read_receipts_member_idx on read_receipts (member_id);

/**
 * Unread counts for the signed-in member, across every reunion at once.
 *
 * One query rather than a pair per reunion, because the dashboard lists them
 * all and would otherwise issue a round-trip each. A member who has never
 * opened a channel has no receipt row, so everything in it counts as unread —
 * hence the left joins and the null-safe comparison.
 *
 * Your own messages never count: you have read what you just wrote.
 */
create or replace function my_unread_counts()
returns table (reunion_id uuid, chat_unread bigint, announcements_unread bigint)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select id from members where auth_user_id = auth.uid()
  ),
  chat as (
    select m.reunion_id, count(*) as unread
    from messages m
    cross join me
    left join read_receipts r
      on r.member_id = me.id
     and r.channel = 'chat'
     and r.reunion_id = m.reunion_id
     and r.sub_event_id is not distinct from m.sub_event_id
    where m.sender_id is distinct from me.id
      and (r.last_read_at is null or m.created_at > r.last_read_at)
    group by m.reunion_id
  ),
  posts as (
    select a.reunion_id, count(*) as unread
    from announcements a
    cross join me
    left join read_receipts r
      on r.member_id = me.id
     and r.channel = 'announcements'
     and r.reunion_id = a.reunion_id
     and r.sub_event_id is null
    where a.created_by is distinct from me.id
      and (r.last_read_at is null or a.created_at > r.last_read_at)
    group by a.reunion_id
  )
  select
    coalesce(chat.reunion_id, posts.reunion_id) as reunion_id,
    coalesce(chat.unread, 0) as chat_unread,
    coalesce(posts.unread, 0) as announcements_unread
  from chat
  full outer join posts on posts.reunion_id = chat.reunion_id;
$$;

comment on function my_unread_counts() is
  'Per-reunion unread chat messages and announcements for the signed-in member.';

revoke execute on function my_unread_counts() from public;
grant execute on function my_unread_counts() to authenticated;

-- ---- RLS ----

alter table read_receipts enable row level security;

-- A receipt is private bookkeeping: only its owner ever touches it.
create policy "ReadReceipts: own rows" on read_receipts
  for all to authenticated
  using (member_id = get_my_member_id())
  with check (member_id = get_my_member_id());
