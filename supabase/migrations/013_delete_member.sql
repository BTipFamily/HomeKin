-- ============================================================
-- Deleting a member profile
-- ============================================================
--
-- Foreign keys already cascade the rows that belong to a person (signups,
-- balances, survey responses, relationships, invitations) and null out the ones
-- that merely reference them (authorship, photo uploads, chat messages). Two
-- things they do not handle:
--
--   * photos.tagged_members is a uuid[] with no foreign key, so a plain delete
--     leaves the departed member's id sitting in every photo they were tagged
--     in, forever.
--   * Nothing stops an admin deleting themselves, or the last admin, which
--     locks the family out of their own directory.
--
-- Both live here, along with a report of what was destroyed, so the UI can tell
-- an admin what they are about to lose before they lose it.
--
-- Merging is almost always the better answer for a duplicate — this is for
-- someone who genuinely should not be in the directory at all.

create or replace function delete_member(p_member uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor members%rowtype;
  v_target members%rowtype;
  v_report jsonb;
  v_count integer;
begin
  -- security definer bypasses RLS, so authorize here.
  select * into v_actor from members where auth_user_id = auth.uid();
  if v_actor.id is null or v_actor.role <> 'admin' then
    raise exception 'Only an admin can delete a member'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_target from members where id = p_member for update;
  if not found then
    raise exception 'That member no longer exists'
      using errcode = 'no_data_found';
  end if;

  -- This doubles as the lockout guard. The only way to delete the last admin
  -- would be for that admin to delete themselves, since the caller must be an
  -- admin to get this far; refusing self-deletion therefore guarantees at least
  -- one admin always remains.
  if v_target.id = v_actor.id then
    raise exception 'You cannot delete your own profile'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Everything that is about to disappear, counted while it still exists.
  v_report := jsonb_build_object(
    'deleted_id', v_target.id,
    'deleted_name', v_target.name,
    'deleted_email', v_target.email,
    'had_login', v_target.auth_user_id is not null,
    'auth_user_id', v_target.auth_user_id,
    'signups', (select count(*) from signups where member_id = p_member),
    'balances', (select count(*) from balances where member_id = p_member),
    'amount_owed', coalesce((select sum(amount_owed) from balances where member_id = p_member), 0),
    'amount_paid', coalesce((select sum(amount_paid) from balances where member_id = p_member), 0),
    'relationships', (
      select count(*) from relationships
      where member_id = p_member or related_member_id = p_member
    ),
    'survey_responses', (select count(*) from survey_responses where member_id = p_member),
    'invitations', (select count(*) from invitations where member_id = p_member)
  );

  -- Strip the id out of every photo tag list. array_remove leaves an empty
  -- array rather than null, which is what the not-null default expects.
  update photos
  set tagged_members = array_remove(tagged_members, p_member)
  where p_member = any(tagged_members);
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('photos_untagged', v_count);

  -- The remaining tables are handled by their foreign keys: cascade for rows
  -- that belong to this person, set null for rows that merely credit them.
  delete from members where id = p_member;

  return v_report;
end;
$$;

comment on function delete_member(uuid) is
  'Permanently deletes a member and everything cascading from them. Admin only. Refuses self-deletion and deleting the last admin.';

revoke execute on function delete_member(uuid) from public;
grant execute on function delete_member(uuid) to authenticated;
