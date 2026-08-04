-- ============================================================
-- Dietary, health and mobility needs — with privacy that is real
-- ============================================================
--
-- The committee cannot cater or pick a venue without knowing who cannot manage
-- stairs and who cannot eat shellfish. Today that lives in somebody's texts,
-- and every reunion it gets re-collected from scratch.
--
-- The obvious home is the members table, beside phone and address, using the
-- visibility_settings jsonb that already governs those. That would be a
-- mistake, and it is worth being explicit about why.
--
-- members has exactly one select policy:
--
--     create policy "Members: authenticated users can view all" on members
--       for select to authenticated using (true);
--
-- Every signed-in relative can read every column of every member row —
-- including visibility_settings itself. The levels in src/lib/visibility.ts are
-- applied at *render time*, in three page components. For a phone number that
-- is a reasonable trade. For "coeliac, and uses a walking frame" it is not: the
-- data would be one query away from anybody with a login, while the app told
-- the member it was committee-only. Privacy that is enforced by remembering to
-- filter is not privacy; it is a promise the schema cannot keep.
--
-- So this is its own table, where a row-level policy can actually say what we
-- mean. Committee-only is enforced by Postgres. A member who wants their needs
-- visible to the whole family opts in, which is the direction that should
-- require a deliberate choice.

create table member_support_needs (
  -- The member is the key: one set of needs per person, updated rather than
  -- accumulated, so there is never a question of which row is current.
  member_id uuid primary key references members(id) on delete cascade,

  dietary_notes text,
  health_notes text,
  mobility_notes text,

  -- Opt-in, not opt-out. Defaulting this to true would share somebody's health
  -- information with the whole directory the moment they filled the form in.
  share_with_family boolean not null default false,

  updated_at timestamptz not null default now()
);

comment on table member_support_needs is
  'Sensitive member needs. Separate from members because that table is readable in full by every authenticated user; here the policy is real.';
comment on column member_support_needs.share_with_family is
  'Opt-in. False means committee and admin only, enforced by RLS rather than by render-time filtering.';

-- ---- RLS ----
alter table member_support_needs enable row level security;

-- The policy that is the entire point of the table. A member always sees their
-- own; the committee sees everyone's, because they are the ones catering;
-- everybody else sees a row only if its owner chose to share it.
create policy "SupportNeeds: own, committee, or shared" on member_support_needs
  for select to authenticated
  using (
    member_id = get_my_member_id()
    or get_my_role() in ('committee', 'admin')
    or share_with_family = true
  );

create policy "SupportNeeds: members write their own" on member_support_needs
  for insert to authenticated
  with check (member_id = get_my_member_id() or get_my_role() in ('committee', 'admin'));

create policy "SupportNeeds: members change their own" on member_support_needs
  for update to authenticated
  using (member_id = get_my_member_id() or get_my_role() in ('committee', 'admin'))
  with check (member_id = get_my_member_id() or get_my_role() in ('committee', 'admin'));

create policy "SupportNeeds: members remove their own" on member_support_needs
  for delete to authenticated
  using (member_id = get_my_member_id() or get_my_role() in ('committee', 'admin'));

-- ---- Volunteering, which is not sensitive ----
-- Deliberately on members rather than in the table above. Who has offered to
-- help is something the family benefits from seeing, it belongs beside
-- family_branch, and putting it behind a committee-only policy would hide the
-- one thing here that works better in the open.
--
-- This is the standing offer. interest_responses.willing_to_volunteer stays as
-- the answer for one particular reunion — a person can be generally willing and
-- unavailable this year, and collapsing the two would lose that.
alter table members
  add column volunteer_interest boolean not null default false,
  add column volunteer_areas text[] not null default '{}';

comment on column members.volunteer_interest is
  'A standing offer to help. Per-reunion availability is interest_responses.willing_to_volunteer.';

-- ---- merge_members ----
-- member_support_needs is keyed on member_id alone, so merging two profiles
-- that both have a row would violate the primary key.
--
-- Restated in full, as every migration touching this function must be —
-- Postgres cannot amend a body in place, and 028 did not change that. What 028
-- did change is the size of the addition: the support-needs fold below is one
-- call rather than the twenty lines of hand-written dedup it replaces, and the
-- rule it uses is the same one every other table here goes through.
--
-- The surviving profile's needs win. Medical information from a duplicate is
-- not something to merge field by field: half of one person's allergies and
-- half of another's is more dangerous than either on its own.

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
