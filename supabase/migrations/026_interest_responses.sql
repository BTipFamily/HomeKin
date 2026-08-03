-- ============================================================
-- Interest: the question that comes before every other question
-- ============================================================
--
-- HomeKin starts at "sign up and pay". It assumes somebody has already decided
-- when the reunion is, where it is and what it costs — which is the hardest
-- part of planning one, and the part the committee currently does over text
-- messages and phone calls with no way to see the answers together.
--
-- This is a *typed* table rather than a generic survey. HomeKin already has
-- surveys, and they are the right tool for open questions, but their answers
-- are free-form: you cannot add up "how many are you bringing" across forty
-- families when the answers are strings. The entire value of gathering
-- interest is the summary — projected headcount, which months work, what
-- people can afford — so the columns have to be countable.
--
-- Existing generic surveys are untouched and remain the place for anything
-- open-ended. This complements them; it does not replace them.

create table interest_responses (
  id uuid primary key default uuid_generate_v4(),
  reunion_id uuid not null references reunions(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  -- Recorded when the member has a household, so the committee can see one
  -- answer per family rather than several. Nullable because households are
  -- optional, and `set null` so leaving one does not erase the response.
  household_id uuid references households(id) on delete set null,

  -- 'probably' and 'unsure' exist because they are the honest answers this far
  -- out, and collapsing them into yes/no would make the projection a fiction.
  attending text not null check (attending in ('yes', 'probably', 'unsure', 'no')),

  adults integer not null default 0 check (adults >= 0),
  youth integer not null default 0 check (youth >= 0),
  children integer not null default 0 check (children >= 0),

  -- Month numbers, not dates. Nobody knows the date yet — that is what the
  -- date poll in the next phase is for. This answers "when could you travel".
  preferred_months integer[] not null default '{}',

  preferred_length text check (preferred_length in ('one_day', 'weekend', 'long_weekend', 'week')),
  -- A band, not a number. Asking a family to name a figure they can afford is
  -- an uncomfortable question that gets skipped; a band gets answered.
  budget_band text check (budget_band in ('under_100', '100_250', '250_500', '500_plus', 'unsure')),
  lodging_need text check (lodging_need in ('hotel', 'rental', 'stay_with_family', 'camping', 'none', 'unsure')),

  willing_to_volunteer boolean not null default false,
  volunteer_areas text[] not null default '{}',
  history_interest boolean not null default false,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One answer per person per reunion. Changing your mind updates the row
  -- rather than adding a second opinion to the count.
  unique (reunion_id, member_id)
);

create index interest_responses_reunion_idx on interest_responses (reunion_id);
create index interest_responses_household_idx on interest_responses (household_id)
  where household_id is not null;

-- Month numbers must be months.
alter table interest_responses
  add constraint interest_responses_months_valid
  check (
    preferred_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]
  );

-- ---- RLS ----
alter table interest_responses enable row level security;

-- Members see their own; the committee sees everything, which is the whole
-- point of collecting it.
create policy "InterestResponses: own or committee can view" on interest_responses
  for select to authenticated
  using (member_id = get_my_member_id() or get_my_role() in ('committee', 'admin'));

create policy "InterestResponses: members answer for themselves" on interest_responses
  for insert to authenticated
  with check (member_id = get_my_member_id());

create policy "InterestResponses: members can change their answer" on interest_responses
  for update to authenticated
  using (member_id = get_my_member_id() or get_my_role() in ('committee', 'admin'));

create policy "InterestResponses: own or committee can delete" on interest_responses
  for delete to authenticated
  using (member_id = get_my_member_id() or get_my_role() in ('committee', 'admin'));

-- ============================================================
-- merge_members has to learn about interest responses
-- ============================================================
--
-- Reproduced from 024 with one block added after Household membership.
-- Everything else is verbatim.

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

  -- ---- Household membership (primary key on member_id) ----
  -- NEW in 024. A member belongs to at most one household, so moving the
  -- source's membership onto a profile that already has one violates the
  -- primary key and rolls the entire merge back. The surviving profile's
  -- household wins and the duplicate's membership row is dropped — the same
  -- shape as survey_responses and photo_likes above, for the same reason.
  delete from household_members hm
  where hm.member_id = p_source
    and exists (select 1 from household_members t where t.member_id = p_target);
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('household_memberships_dropped', v_count);

  update household_members set member_id = p_target where member_id = p_source;
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('household_memberships_moved', v_count);

  -- ---- Interest responses (unique on reunion_id, member_id) ----
  -- NEW in 026. Both profiles answering the interest form for the same reunion
  -- is one family answering once. The surviving profile's answer is kept, the
  -- duplicate's is dropped — matching survey_responses, whose answers are the
  -- same kind of statement of intent.
  delete from interest_responses r
  where r.member_id = p_source
    and exists (
      select 1 from interest_responses t
      where t.member_id = p_target and t.reunion_id = r.reunion_id
    );
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('interest_responses_dropped', v_count);

  update interest_responses set member_id = p_target where member_id = p_source;
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('interest_responses_moved', v_count);

  -- Ownership columns on the household itself; no constraints to work around.
  update households set primary_contact_id = p_target where primary_contact_id = p_source;
  update households set created_by = p_target where created_by = p_source;

  -- ---- Balances (conflicts already ruled out above) ----
  update balances set member_id = p_target where member_id = p_source;
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('balances_moved', v_count);

  -- ---- Payments (denormalized member_id with no uniqueness to work around) ----
  -- NEW in 022, and the reason this migration exists. Without it the source
  -- member's payments are not moved, so `delete from members` at the end of
  -- this function cascades them away — taking the ledger history with them and
  -- firing the balance recalc trigger, which then lowers amount_paid to match.
  -- Merging two duplicate profiles silently destroyed money records.
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
