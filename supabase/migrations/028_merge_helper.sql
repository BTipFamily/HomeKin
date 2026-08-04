-- ============================================================
-- Stop merge_members growing a new copy every migration
-- ============================================================
--
-- Every table keyed on a member plus something else — a survey, a photo, a
-- reunion — has the same problem when two profiles merge: if both rows exist,
-- moving the source's onto the target violates the key and rolls the entire
-- merge back. Every one of them has been solved the same way, by hand:
--
--   delete the source's row where the target already has one, then move the rest
--
-- That block now appears five times, and because Postgres cannot amend a
-- function body in place, the whole 290-line function has been restated in
-- migrations 019, 022, 024 and 026 to add them. Each restatement was verified
-- by diff, but the sixth and seventh are coming — support needs and location
-- votes — and this is the largest remaining source of risk in the schema.
--
-- One helper, called once per table. The dedup rule lives in a single place
-- where it can be reasoned about, and a new member-keyed table becomes one line
-- rather than twenty and a full restatement.
--
-- Nothing about the merge's behaviour changes. The existing assertions in
-- supabase/tests/02, 10, 11, 12 and 13 pass unchanged, which is the entire
-- argument for doing this now rather than after two more copies exist.

/**
 * Folds one member's rows in `p_table` into another's.
 *
 * `p_scope_cols` names the other columns of the uniqueness rule — the survey,
 * the photo, the reunion. Empty means the member column is the whole key, as
 * with household_members, where a person belongs to exactly one household.
 *
 * Dynamic SQL because the alternative is the five copies this replaces. Every
 * identifier goes through format's %I so a name cannot be anything but an
 * identifier, and the only caller is merge_members below, passing literals.
 */
create or replace function merge_dedup_move(
  p_table text,
  p_member_col text,
  p_scope_cols text[],
  p_source uuid,
  p_target uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := '';
  v_dropped integer;
  v_moved integer;
begin
  -- `is not distinct from` rather than `=` so a nullable scope column matches
  -- null-to-null, the way balances already treats sub_event_id.
  if p_scope_cols is not null and array_length(p_scope_cols, 1) is not null then
    select coalesce(string_agg(format(' and t.%I is not distinct from s.%I', c, c), ''), '')
      into v_scope
    from unnest(p_scope_cols) as c;
  end if;

  execute format(
    'delete from %I s where s.%I = $1 and exists (select 1 from %I t where t.%I = $2%s)',
    p_table, p_member_col, p_table, p_member_col, v_scope
  ) using p_source, p_target;
  get diagnostics v_dropped = row_count;

  execute format('update %I set %I = $2 where %I = $1', p_table, p_member_col, p_member_col)
    using p_source, p_target;
  get diagnostics v_moved = row_count;

  return jsonb_build_object('dropped', v_dropped, 'moved', v_moved);
end;
$$;

comment on function merge_dedup_move(text, text, text[], uuid, uuid) is
  'Internal to merge_members: drops the source member''s rows that would collide with the target''s, then moves the rest.';

revoke execute on function merge_dedup_move(text, text, text[], uuid, uuid) from public;

-- ============================================================
-- merge_members, using it
-- ============================================================
--
-- Same behaviour, same report keys, same order of operations. The five
-- hand-written dedup blocks become five calls; relationships keep their own
-- code because they are genuinely different — an edge has two member columns
-- and an edge between the two profiles becomes a self-edge, which no generic
-- helper should try to express.

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
