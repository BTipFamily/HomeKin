-- ============================================================
-- From "somebody suggested Charleston" to a decision
-- ============================================================
--
-- Families now name places on the interest form, and the dashboard ranks what
-- they said. Ranking suggestions is not deciding, though: "eleven households
-- said Atlanta" tells you nothing about whether the venue there holds ninety
-- people or costs twice as much.
--
-- So the committee promotes the good suggestions to a shortlist with the
-- details that actually decide it, and the family votes on that. Two steps
-- rather than one because they answer different questions: the suggestions say
-- where people want to go, the shortlist says where the reunion can go.

create table reunion_locations (
  id uuid primary key default uuid_generate_v4(),
  reunion_id uuid not null references reunions(id) on delete cascade,

  name text not null check (length(btrim(name)) > 0),
  city text,
  venue_type text,
  capacity integer check (capacity is null or capacity >= 1),
  est_cost_per_person numeric(10, 2) check (est_cost_per_person is null or est_cost_per_person >= 0),
  -- Its own field rather than buried in notes: for the families this decides,
  -- it is the first thing they need to know and the last thing to get lost.
  accessibility_notes text,
  notes text,

  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index reunion_locations_reunion_idx on reunion_locations (reunion_id);

create table location_votes (
  location_id uuid not null references reunion_locations(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- The composite key is the one-vote rule, the same way photo_likes works.
  -- Two tabs or a double tap cannot inflate a count that decides where forty
  -- people spend a weekend.
  primary key (location_id, member_id)
);

create index location_votes_member_idx on location_votes (member_id);

-- ---- RLS ----
alter table reunion_locations enable row level security;
alter table location_votes enable row level security;

create policy "ReunionLocations: authenticated can view" on reunion_locations
  for select to authenticated using (true);

create policy "ReunionLocations: committee can manage" on reunion_locations
  for all to authenticated
  using (get_my_role() in ('committee', 'admin'))
  with check (get_my_role() in ('committee', 'admin'));

-- Votes are readable by everyone: a vote nobody can see the result of is not
-- a vote, and seeing the count is what makes people cast one.
create policy "LocationVotes: authenticated can view" on location_votes
  for select to authenticated using (true);

create policy "LocationVotes: members vote as themselves" on location_votes
  for insert to authenticated
  with check (member_id = get_my_member_id());

create policy "LocationVotes: members can change their mind" on location_votes
  for delete to authenticated
  using (member_id = get_my_member_id());

-- ---- Counting votes past the select policy ----
-- Same problem the event headcounts had: nothing hides a vote here, but the
-- count is wanted for a whole reunion at once rather than a round trip each.
create or replace function location_vote_counts(p_reunion uuid)
returns table (location_id uuid, votes integer)
language sql
security definer
set search_path = public
stable
as $$
  select l.id, count(v.member_id)::integer
  from reunion_locations l
  left join location_votes v on v.location_id = l.id
  where l.reunion_id = p_reunion
  group by l.id;
$$;

revoke execute on function location_vote_counts(uuid) from public;
grant execute on function location_vote_counts(uuid) to authenticated;

-- ---- merge_members ----
-- location_votes is keyed on (location_id, member_id), so two profiles that
-- voted for the same place would collide. One person, one vote — the duplicate
-- is dropped, exactly as photo_likes and survey_responses are.
--
-- Restated in full because Postgres cannot amend a body in place. The addition
-- is two lines, which is what the helper in 028 bought.

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
  v_fold jsonb;
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
  -- Kept by hand: an edge has two member columns, and an edge between the two
  -- profiles becomes a self-edge once they are one person, which the
  -- relationships_not_self constraint forbids.
  delete from relationships
  where (member_id = p_source and related_member_id = p_target)
     or (member_id = p_target and related_member_id = p_source);
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('relationships_self_dropped', v_count);

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

  -- ---- Signups ----
  -- A confirmation on the losing profile is real information, so carry it over
  -- before the duplicate is dropped. Headcount is deliberately not summed: the
  -- same person counted twice is the bug being fixed. This runs before the
  -- helper because it is about what the dropped row *meant*, not about the key.
  update signups t
  set status = 'confirmed'
  from signups s
  where t.member_id = p_target
    and s.member_id = p_source
    and s.sub_event_id = t.sub_event_id
    and s.status = 'confirmed'
    and t.status <> 'confirmed';

  v_fold := merge_dedup_move('signups', 'member_id', array['sub_event_id'], p_source, p_target);
  v_report := v_report || jsonb_build_object(
    'signups_duplicate_dropped', v_fold -> 'dropped',
    'signups_moved', v_fold -> 'moved'
  );

  -- ---- Survey responses ---- the kept profile's answers win.
  v_fold := merge_dedup_move('survey_responses', 'member_id', array['survey_id'], p_source, p_target);
  v_report := v_report || jsonb_build_object(
    'survey_responses_dropped', v_fold -> 'dropped',
    'survey_responses_moved', v_fold -> 'moved'
  );

  -- ---- Photo likes ---- two profiles liking one photo is one person liking it.
  v_fold := merge_dedup_move('photo_likes', 'member_id', array['photo_id'], p_source, p_target);
  v_report := v_report || jsonb_build_object(
    'photo_likes_dropped', v_fold -> 'dropped',
    'photo_likes_moved', v_fold -> 'moved'
  );

  -- ---- Household membership ---- no scope column: a member belongs to one.
  v_fold := merge_dedup_move('household_members', 'member_id', array[]::text[], p_source, p_target);
  v_report := v_report || jsonb_build_object(
    'household_memberships_dropped', v_fold -> 'dropped',
    'household_memberships_moved', v_fold -> 'moved'
  );

  update households set primary_contact_id = p_target where primary_contact_id = p_source;
  update households set created_by = p_target where created_by = p_source;

  -- ---- Interest responses ---- one family answering once.
  v_fold := merge_dedup_move('interest_responses', 'member_id', array['reunion_id'], p_source, p_target);
  v_report := v_report || jsonb_build_object(
    'interest_responses_dropped', v_fold -> 'dropped',
    'interest_responses_moved', v_fold -> 'moved'
  );

  -- ---- Support needs ---- keyed on the member alone; the survivor's win.
  v_fold := merge_dedup_move('member_support_needs', 'member_id', array[]::text[], p_source, p_target);
  v_report := v_report || jsonb_build_object(
    'support_needs_dropped', v_fold -> 'dropped',
    'support_needs_moved', v_fold -> 'moved'
  );

  -- ---- Location votes ---- one person, one vote for a place.
  v_fold := merge_dedup_move('location_votes', 'member_id', array['location_id'], p_source, p_target);
  v_report := v_report || jsonb_build_object(
    'location_votes_dropped', v_fold -> 'dropped',
    'location_votes_moved', v_fold -> 'moved'
  );

  -- ---- Balances (conflicts already ruled out above) ----
  update balances set member_id = p_target where member_id = p_source;
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('balances_moved', v_count);

  -- ---- Payments ----
  -- No uniqueness to work around, but it must happen: payments cascade on
  -- member delete, so leaving them behind erases the ledger and reopens
  -- balances that were settled. See 022.
  update payments set member_id = p_target where member_id = p_source;
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('payments_moved', v_count);

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
  update reunion_locations set created_by = p_target where created_by = p_source;
  update sub_events set created_by = p_target where created_by = p_source;
  update announcements set created_by = p_target where created_by = p_source;
  update surveys set created_by = p_target where created_by = p_source;
  update photos set uploaded_by = p_target where uploaded_by = p_source;
  update photo_comments set author_id = p_target where author_id = p_source;
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
