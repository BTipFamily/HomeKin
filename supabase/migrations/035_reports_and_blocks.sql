-- ============================================================
-- Reporting content, and blocking a person
-- ============================================================
--
-- This app carries user-generated content in five places — photos, photo
-- comments, reunion chat, direct messages and announcements — and until now the
-- only remedy for any of it was to be on the committee and delete it yourself. A
-- member who opened a photo album and found something upsetting had nothing to
-- press.
--
-- App Store guideline 1.2 requires three things of an app with user content: a
-- way to report it, a way to block the person, and somebody who acts on reports.
-- The first two are here. The third is the committee queue at /admin/reports.
--
-- Both tables are deliberately global rather than per-reunion. Roles in this app
-- are already global (get_my_role reads one column on members, with no reunion in
-- it), and somebody you have blocked is somebody you have blocked — not somebody
-- you have blocked at the 2026 picnic.

-- ---------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------
--
-- content_id has no foreign key, and cannot: one report table covers five
-- different content tables. The cost is that a report can outlive the thing it
-- points at — which is the right way round. A committee member deleting the
-- photo should not erase the evidence that it was reported, and the queue needs
-- to be able to say "this has already been dealt with".

create table content_reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references members(id) on delete cascade,
  content_type text not null check (
    content_type in ('photo', 'photo_comment', 'message', 'direct_message', 'announcement', 'member')
  ),
  content_id uuid not null,
  -- Where the committee should look. Null for a direct message or a report
  -- about a person, neither of which belongs to a reunion.
  reunion_id uuid references reunions(id) on delete cascade,
  reason text not null check (
    reason in ('spam', 'harassment', 'hate', 'nudity', 'violence', 'private_information', 'other')
  ),
  detail text,
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  reviewed_by uuid references members(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),

  -- Reporting the same thing twice is a no-op rather than an error: the action
  -- upserts on this, so a second press re-reads as "already reported" instead of
  -- stacking duplicates in the queue.
  unique (reporter_id, content_type, content_id)
);

-- The queue's only ordering: open first, newest first.
create index content_reports_open_idx
  on content_reports (status, created_at desc);

alter table content_reports enable row level security;

create policy "Reports: you see your own, committee sees all" on content_reports
  for select to authenticated
  using (
    reporter_id = get_my_member_id()
    or get_my_role() in ('committee', 'admin')
  );

create policy "Reports: anyone can report as themselves" on content_reports
  for insert to authenticated
  with check (reporter_id = get_my_member_id());

-- Reporters cannot revise or withdraw a report. A report is a statement about
-- what somebody saw at a moment; editing it after the committee has read it
-- would make the queue untrustworthy.
create policy "Reports: only the committee resolves them" on content_reports
  for update to authenticated
  using (get_my_role() in ('committee', 'admin'))
  with check (get_my_role() in ('committee', 'admin'));

-- ---------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------

create table member_blocks (
  blocker_id uuid not null references members(id) on delete cascade,
  blocked_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint member_blocks_not_self check (blocker_id <> blocked_id)
);

-- is_blocked() reads this in the blocked direction, which the primary key
-- (blocker first) cannot serve.
create index member_blocks_blocked_idx on member_blocks (blocked_id);

alter table member_blocks enable row level security;

-- You can see, make and lift your own blocks, and that is all. Nobody is ever
-- shown the list of people who have blocked them: telling somebody they have
-- been blocked is how a block turns into a confrontation.
create policy "Blocks: you manage your own" on member_blocks
  for all to authenticated
  using (blocker_id = get_my_member_id())
  with check (blocker_id = get_my_member_id());

/**
 * Is there a block between the caller and this member, in either direction?
 *
 * Both directions on purpose. If you block somebody, you stop seeing them — but
 * they also stop seeing you, because a block that only works one way leaves the
 * person who was being harassed still visible to the person doing it.
 *
 * security definer because the caller cannot read rows where they are the
 * blocked party, and must not be able to: that is what keeps a block quiet.
 */
create or replace function is_blocked(p_other uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from member_blocks
    where (blocker_id = get_my_member_id() and blocked_id = p_other)
       or (blocked_id = get_my_member_id() and blocker_id = p_other)
  )
$$;

revoke execute on function is_blocked(uuid) from public;
grant execute on function is_blocked(uuid) to authenticated;

-- ---------------------------------------------------------------
-- Making a block actually hide things
-- ---------------------------------------------------------------
--
-- `as restrictive` rather than new permissive policies. Permissive policies are
-- OR-ed together, so adding one would widen access rather than narrow it;
-- restrictive policies are AND-ed with whatever else already allows the read.
-- That means these subtract from the existing rules without editing them, and a
-- future policy added to these tables inherits the block filter for free.
--
-- Authorship columns are nullable (`on delete set null`), so each check has to
-- pass when the author is unknown — an orphaned comment is not blocked content.

create policy "Photo comments: hide blocked people" on photo_comments
  as restrictive for select to authenticated
  using (author_id is null or not is_blocked(author_id));

create policy "Messages: hide blocked people" on messages
  as restrictive for select to authenticated
  using (sender_id is null or not is_blocked(sender_id));

create policy "DMs: hide blocked people" on direct_messages
  as restrictive for select to authenticated
  using (
    (sender_id is null or not is_blocked(sender_id))
    and (recipient_id is null or not is_blocked(recipient_id))
  );

create policy "Photos: hide blocked people" on photos
  as restrictive for select to authenticated
  using (uploaded_by is null or not is_blocked(uploaded_by));

-- Announcements are deliberately not filtered. They are the committee speaking
-- to the whole family about when and where to turn up, and somebody who has
-- blocked a committee member still needs to know the picnic moved. They remain
-- reportable.
