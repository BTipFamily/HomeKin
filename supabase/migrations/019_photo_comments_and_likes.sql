-- ============================================================
-- Saying something back: comments and likes on the album
-- ============================================================
--
-- The photo album is the only purely social part of HomeKin, and until now it
-- was entirely one-way. Somebody posts a picture of Grandma at the 1987
-- reunion and the only way to react is to leave the album and say so in chat,
-- where it is detached from the photo and gone by the next day.
--
-- Two tables, deliberately separate rather than one polymorphic "reactions"
-- table: a like is a fact about a pair (this member, this photo) with nothing
-- else to say, and a comment is a piece of writing with an author and a
-- lifetime. Merging them would mean a nullable body and a kind column that
-- every query has to remember to filter on.

create table photo_comments (
  id uuid primary key default uuid_generate_v4(),
  photo_id uuid not null references photos(id) on delete cascade,
  -- Set null rather than cascade, matching photos.uploaded_by: removing a
  -- member should not silently delete a conversation other people were part of.
  author_id uuid references members(id) on delete set null,
  -- Enforced here as well as in the action, because an empty comment is
  -- meaningless whatever path inserted it.
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

-- Covers the only read there is: one photo's comments, oldest first.
create index photo_comments_photo_idx on photo_comments (photo_id, created_at);

create table photo_likes (
  photo_id uuid not null references photos(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- The composite key *is* the "one like per member per photo" rule. Enforcing
  -- it here rather than in the toggle means a double-tap, two tabs, or a
  -- retried request cannot inflate a count, without anything having to check
  -- first. Unlike read_receipts, neither column is nullable, so this can be a
  -- plain primary key rather than a pair of partial unique indexes.
  primary key (photo_id, member_id)
);

-- "Who else liked this" reads by photo, which the primary key already covers.
-- This one is for the reverse: everything a member has liked, which
-- merge_members walks below.
create index photo_likes_member_idx on photo_likes (member_id);

-- ---- An index the album should always have had ----
-- photos had no indexes at all, so the album's only query —
-- `where reunion_id = ? order by created_at desc` — was a sequential scan over
-- every photo in every reunion. Likes and comments make that query hotter, so
-- it is worth fixing here rather than waiting for it to be slow.
create index photos_reunion_created_idx on photos (reunion_id, created_at desc);

-- ---- RLS ----

alter table photo_comments enable row level security;
alter table photo_likes enable row level security;

-- Everyone signed in can read both. Likes are readable by design: the point of
-- a like in a family album is that Grandma's name shows up under the photo.
create policy "PhotoComments: authenticated can view" on photo_comments
  for select to authenticated using (true);

create policy "PhotoComments: members can write their own" on photo_comments
  for insert to authenticated
  with check (author_id = get_my_member_id());

create policy "PhotoComments: author or committee can delete" on photo_comments
  for delete to authenticated
  using (author_id = get_my_member_id() or get_my_role() in ('committee', 'admin'));

-- No update policy. Nothing in this app is editable by its author today, and
-- adding the first one is a decision about edit history and "edited" markers
-- that a comment box does not get to make on its own. Delete and repost.

create policy "PhotoLikes: authenticated can view" on photo_likes
  for select to authenticated using (true);

create policy "PhotoLikes: members can like as themselves" on photo_likes
  for insert to authenticated
  with check (member_id = get_my_member_id());

create policy "PhotoLikes: members can unlike their own" on photo_likes
  for delete to authenticated
  using (member_id = get_my_member_id());

-- ============================================================
-- merge_members has to learn about both
-- ============================================================
--
-- Merging two profiles that both liked the same photo would violate
-- photo_likes' primary key and abort the entire merge — a failure that would
-- only surface the first time an admin merged two real duplicates, long after
-- this migration shipped. survey_responses already had this exact problem and
-- solved it by dropping the source's duplicates before reassigning the rest;
-- the photo_likes block below does the same, in the same place, for the same
-- reason.
--
-- The rest of this function is reproduced unchanged from 011. Postgres has no
-- way to amend a function body in place, so the whole thing has to be restated
-- to add eight lines. Only two things differ from 011:
--   * the "Photo likes" block, before Balances
--   * one photo_comments line in the plain-ownership list
-- Everything else — the row locks, the balance-conflict refusal, the signup
-- confirmation carry-over, the profile fold — is verbatim.

create or replace function merge_members(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_source members%rowtype;
  v_target members%rowtype;
  v_conflict text;
  v_report jsonb := '{}'::jsonb;
  v_count integer;
begin
  -- security definer bypasses RLS, so the role check has to happen here.
  select role into v_actor_role from members where auth_user_id = auth.uid();
  if v_actor_role is distinct from 'admin' then
    raise exception 'Only an admin can merge members'
      using errcode = 'insufficient_privilege';
  end if;

  if p_source = p_target then
    raise exception 'Cannot merge a member into themselves'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Lock both rows for the duration so a concurrent edit (or a second merge
  -- naming the same pair in reverse) can't interleave.
  select * into v_source from members where id = p_source for update;
  if not found then
    raise exception 'The member being merged away no longer exists'
      using errcode = 'no_data_found';
  end if;

  select * into v_target from members where id = p_target for update;
  if not found then
    raise exception 'The member being kept no longer exists'
      using errcode = 'no_data_found';
  end if;

  -- ---- Refuse rather than guess when money is involved ----
  -- Two balances against the same sub-event might be one obligation entered
  -- twice or two genuine charges, and nothing in the data distinguishes them.
  -- Summing could overcharge and dropping could undercharge, so this stops and
  -- asks the admin to settle it by hand.
  select string_agg(distinct coalesce(se.name, 'General Fund'), ', ')
    into v_conflict
  from balances bs
  left join sub_events se on se.id = bs.sub_event_id
  where bs.member_id = p_source
    and exists (
      select 1 from balances bt
      where bt.member_id = p_target
        and bt.reunion_id = bs.reunion_id
        and bt.sub_event_id is not distinct from bs.sub_event_id
    );

  if v_conflict is not null then
    raise exception
      'Both profiles have a balance for: %. Settle or delete one of them, then merge.', v_conflict
      using errcode = 'unique_violation';
  end if;

  -- ---- Relationships ----
  -- Any edge between the two profiles becomes a self-edge once they are one
  -- person, which the relationships_not_self constraint forbids.
  delete from relationships
  where (member_id = p_source and related_member_id = p_target)
     or (member_id = p_target and related_member_id = p_source);
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('relationships_self_dropped', v_count);

  -- Then drop source edges that would collide with an identical target edge
  -- (both profiles recorded as a child of the same person, say) before moving
  -- the rest across. Each direction is handled separately because the unique
  -- key covers both columns.
  delete from relationships r
  where r.member_id = p_source
    and exists (
      select 1 from relationships t
      where t.member_id = p_target
        and t.related_member_id = r.related_member_id
        and t.relationship_type = r.relationship_type
    );
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('relationships_duplicate_dropped', v_count);

  update relationships set member_id = p_target where member_id = p_source;
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('relationships_moved', v_count);

  delete from relationships r
  where r.related_member_id = p_source
    and exists (
      select 1 from relationships t
      where t.related_member_id = p_target
        and t.member_id = r.member_id
        and t.relationship_type = r.relationship_type
    );
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object(
    'relationships_duplicate_dropped',
    (v_report ->> 'relationships_duplicate_dropped')::int + v_count
  );

  update relationships set related_member_id = p_target where related_member_id = p_source;
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object(
    'relationships_moved',
    (v_report ->> 'relationships_moved')::int + v_count
  );

  -- ---- Signups (unique on sub_event_id, member_id) ----
  -- A confirmation on the losing profile is real information, so carry it over
  -- before dropping that row. Headcount is deliberately not summed: the same
  -- person counted twice is the bug being fixed.
  update signups t
  set status = 'confirmed'
  from signups s
  where t.member_id = p_target
    and s.member_id = p_source
    and s.sub_event_id = t.sub_event_id
    and s.status = 'confirmed'
    and t.status <> 'confirmed';

  delete from signups s
  where s.member_id = p_source
    and exists (
      select 1 from signups t
      where t.member_id = p_target and t.sub_event_id = s.sub_event_id
    );
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('signups_duplicate_dropped', v_count);

  update signups set member_id = p_target where member_id = p_source;
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('signups_moved', v_count);

  -- ---- Survey responses (unique on survey_id, member_id) ----
  -- The kept profile's answers win; the other set is discarded.
  delete from survey_responses s
  where s.member_id = p_source
    and exists (
      select 1 from survey_responses t
      where t.member_id = p_target and t.survey_id = s.survey_id
    );
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('survey_responses_dropped', v_count);

  update survey_responses set member_id = p_target where member_id = p_source;
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('survey_responses_moved', v_count);

  -- ---- Photo likes (primary key on photo_id, member_id) ----
  -- NEW in 019. Two profiles that liked the same photo are one person who
  -- liked it once, so the source's duplicate is dropped rather than moved —
  -- moving it would violate the primary key and roll the whole merge back.
  delete from photo_likes l
  where l.member_id = p_source
    and exists (
      select 1 from photo_likes t
      where t.member_id = p_target and t.photo_id = l.photo_id
    );
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('photo_likes_dropped', v_count);

  update photo_likes set member_id = p_target where member_id = p_source;
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('photo_likes_moved', v_count);

  -- ---- Balances (conflicts already ruled out above) ----
  update balances set member_id = p_target where member_id = p_source;
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('balances_moved', v_count);

  -- ---- Photo tags (a uuid[] with no foreign key, so nothing cascades) ----
  update photos
  set tagged_members = (
    select array_agg(distinct tag)
    from unnest(array_replace(tagged_members, p_source, p_target)) as tag
  )
  where p_source = any(tagged_members);
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('photos_retagged', v_count);

  -- ---- Plain ownership columns, no constraints to work around ----
  update reunions set created_by = p_target where created_by = p_source;
  update sub_events set created_by = p_target where created_by = p_source;
  update announcements set created_by = p_target where created_by = p_source;
  update surveys set created_by = p_target where created_by = p_source;
  update photos set uploaded_by = p_target where uploaded_by = p_source;
  update photo_comments set author_id = p_target where author_id = p_source; -- NEW in 019
  update messages set sender_id = p_target where sender_id = p_source;
  update relationships set created_by = p_target where created_by = p_source;
  update reunion_budget_estimates set created_by = p_target where created_by = p_source;
  update reunion_timeline_items set created_by = p_target where created_by = p_source;
  update invite_codes set created_by = p_target where created_by = p_source;
  update invite_codes set used_by = p_target where used_by = p_source;
  update direct_messages set sender_id = p_target where sender_id = p_source;
  update direct_messages set recipient_id = p_target where recipient_id = p_source;

  update invitations set member_id = p_target where member_id = p_source;
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('invitations_moved', v_count);

  -- ---- Fold the profile itself ----
  -- auth_user_id is unique, so the losing row has to let go of its login
  -- before the kept row can adopt it.
  update members set auth_user_id = null where id = p_source;

  update members set
    name = coalesce(nullif(trim(v_target.name), ''), v_source.name),
    phone = coalesce(v_target.phone, v_source.phone),
    address = coalesce(v_target.address, v_source.address),
    family_branch = coalesce(v_target.family_branch, v_source.family_branch),
    date_of_birth = coalesce(v_target.date_of_birth, v_source.date_of_birth),
    bio = coalesce(v_target.bio, v_source.bio),
    photo_url = coalesce(v_target.photo_url, v_source.photo_url),
    gender = coalesce(v_target.gender, v_source.gender),
    latitude = coalesce(v_target.latitude, v_source.latitude),
    longitude = coalesce(v_target.longitude, v_source.longitude),
    geocoded_address = coalesce(v_target.geocoded_address, v_source.geocoded_address),
    geocode_updated_at = coalesce(v_target.geocode_updated_at, v_source.geocode_updated_at),
    -- Target's links win; the source fills in only the ones it left empty.
    social_links =
      jsonb_strip_nulls(coalesce(v_source.social_links, '{}'::jsonb))
      || jsonb_strip_nulls(coalesce(v_target.social_links, '{}'::jsonb)),
    -- Whichever login exists is kept. When both profiles had one the kept
    -- profile's wins and the other account is left without a profile, which is
    -- why the preview warns before this runs.
    auth_user_id = coalesce(v_target.auth_user_id, v_source.auth_user_id),
    role = case
      when 'admin' in (v_target.role, v_source.role) then 'admin'
      when 'committee' in (v_target.role, v_source.role) then 'committee'
      else 'member'
    end,
    created_by_proxy =
      (coalesce(v_target.auth_user_id, v_source.auth_user_id) is null)
  where id = p_target;

  delete from members where id = p_source;

  return v_report || jsonb_build_object(
    'merged_into', p_target,
    'removed', p_source,
    'removed_name', v_source.name,
    'removed_email', v_source.email,
    'adopted_login', (v_target.auth_user_id is null and v_source.auth_user_id is not null),
    'orphaned_login', (v_target.auth_user_id is not null and v_source.auth_user_id is not null)
  );
end;
$$;

comment on function merge_members(uuid, uuid) is
  'Folds the member p_source into p_target and deletes p_source. Admin only. Raises if both hold a balance for the same sub-event.';

revoke execute on function merge_members(uuid, uuid) from public;
grant execute on function merge_members(uuid, uuid) to authenticated;
