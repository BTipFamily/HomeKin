-- ============================================================
-- Deleting a reunion
-- ============================================================
--
-- Every table hanging off a reunion already cascades — sub_events (and their
-- signups), balances, announcements, invitations, surveys (and their
-- responses), photos, messages, budget estimates and timeline items. Invite
-- codes are scoped rather than owned, so they null out and stay usable.
--
-- Two things the foreign keys cannot do:
--
--   * The photos table cascades, but the image files themselves live in the
--     Supabase Storage bucket and would be orphaned there forever, still
--     costing storage and still reachable by URL. The function returns their
--     paths so the caller can sweep the bucket.
--   * Nothing counted what was about to be destroyed, and a reunion is the
--     single largest thing in this app to lose by accident.
--
-- There is deliberately no RLS delete policy on reunions: routing every
-- deletion through this function is what guarantees the storage sweep is not
-- forgotten by some future code path calling .delete() directly.

create or replace function delete_reunion(p_reunion uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_reunion reunions%rowtype;
  v_report jsonb;
begin
  select role into v_actor_role from members where auth_user_id = auth.uid();
  if v_actor_role is distinct from 'admin' then
    raise exception 'Only an admin can delete a reunion'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_reunion from reunions where id = p_reunion for update;
  if not found then
    raise exception 'That reunion no longer exists'
      using errcode = 'no_data_found';
  end if;

  v_report := jsonb_build_object(
    'deleted_id', v_reunion.id,
    'deleted_name', v_reunion.name,
    'deleted_year', v_reunion.year,
    'sub_events', (select count(*) from sub_events where reunion_id = p_reunion),
    'signups', (
      select count(*) from signups s
      join sub_events se on se.id = s.sub_event_id
      where se.reunion_id = p_reunion
    ),
    'balances', (select count(*) from balances where reunion_id = p_reunion),
    'amount_owed', coalesce((select sum(amount_owed) from balances where reunion_id = p_reunion), 0),
    'amount_paid', coalesce((select sum(amount_paid) from balances where reunion_id = p_reunion), 0),
    'announcements', (select count(*) from announcements where reunion_id = p_reunion),
    'invitations', (select count(*) from invitations where reunion_id = p_reunion),
    'surveys', (select count(*) from surveys where reunion_id = p_reunion),
    'survey_responses', (
      select count(*) from survey_responses sr
      join surveys sv on sv.id = sr.survey_id
      where sv.reunion_id = p_reunion
    ),
    'photos', (select count(*) from photos where reunion_id = p_reunion),
    'messages', (select count(*) from messages where reunion_id = p_reunion),
    'timeline_items', (select count(*) from reunion_timeline_items where reunion_id = p_reunion),
    -- Handed back so the caller can delete the underlying files; the rows
    -- themselves are about to cascade away and take the paths with them.
    'storage_paths', coalesce(
      (select jsonb_agg(storage_path) from photos where reunion_id = p_reunion),
      '[]'::jsonb
    ),
    -- Codes scoped to this reunion survive it, unscoped rather than revoked.
    'invite_codes_unscoped', (select count(*) from invite_codes where reunion_id = p_reunion)
  );

  delete from reunions where id = p_reunion;

  return v_report;
end;
$$;

comment on function delete_reunion(uuid) is
  'Permanently deletes a reunion and everything cascading from it. Admin only. Returns the photo storage paths the caller must remove from the bucket.';

revoke execute on function delete_reunion(uuid) from public;
grant execute on function delete_reunion(uuid) to authenticated;
