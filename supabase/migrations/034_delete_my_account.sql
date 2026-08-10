-- ============================================================
-- Deleting your own account
-- ============================================================
--
-- Migration 013 gave admins delete_member, and deliberately refused
-- self-deletion: since only an admin can call it, refusing to let anyone delete
-- themselves is what guaranteed the family could never be left with no admin at
-- all. That reasoning still holds for the admin tool, and it stays.
--
-- But it left nobody able to leave. A member who wants their name, address,
-- phone, birthday, photographs and health notes out of this directory had to
-- ask an admin to do it for them, which is both a poor answer and, for an app in
-- the App Store, a rejected one: guideline 5.1.1(v) requires that an app which
-- lets you create an account also lets you delete it, from inside the app.
--
-- So this is the same operation, authorized the other way round: the actor and
-- the target are the same person by construction, and there is no role check
-- because wanting to leave is not a privilege.
--
-- The one refusal that survives is the last admin. Letting the only admin delete
-- themselves would leave every other member with a directory nobody can
-- administer — a worse outcome for more people than asking one person to hand
-- the role over first. It is refused with an instruction rather than a wall:
-- promote somebody, then leave. That keeps it a step the person can complete
-- themselves, which is what the guideline is actually about.
--
-- What goes: everything delete_member destroys. Signups, balances — including
-- any record of money owed or paid — relationships, survey responses,
-- invitations, and the id in every photo tag list. Deleting an account here does
-- not settle a debt, and the committee loses the record of it. That is the same
-- thing that already happened when an admin removed somebody, so it is at least
-- consistent; the preview in lib/actions/member-delete.ts says so plainly before
-- anyone confirms. Blocking deletion on an unpaid balance is not an option — an
-- account you cannot close until you have paid is precisely what 5.1.1(v)
-- exists to stop.

create or replace function delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me members%rowtype;
  v_admin_count integer;
  v_report jsonb;
  v_count integer;
begin
  -- security definer bypasses RLS, so resolve the caller from the session
  -- rather than from an argument. There is no member id parameter on purpose:
  -- one would turn this into delete_member without the role check.
  select * into v_me from members where auth_user_id = auth.uid() for update;
  if v_me.id is null then
    raise exception 'You are not signed in, or your login is not linked to a profile'
      using errcode = 'insufficient_privilege';
  end if;

  if v_me.role = 'admin' then
    select count(*) into v_admin_count from members where role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'You are the only admin. Make somebody else an admin first, then you can delete your account.'
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  v_report := jsonb_build_object(
    'deleted_id', v_me.id,
    'deleted_name', v_me.name,
    'deleted_email', v_me.email,
    'had_login', v_me.auth_user_id is not null,
    'auth_user_id', v_me.auth_user_id,
    'signups', (select count(*) from signups where member_id = v_me.id),
    'balances', (select count(*) from balances where member_id = v_me.id),
    'amount_owed', coalesce((select sum(amount_owed) from balances where member_id = v_me.id), 0),
    'amount_paid', coalesce((select sum(amount_paid) from balances where member_id = v_me.id), 0),
    'relationships', (
      select count(*) from relationships
      where member_id = v_me.id or related_member_id = v_me.id
    ),
    'survey_responses', (select count(*) from survey_responses where member_id = v_me.id),
    'invitations', (select count(*) from invitations where member_id = v_me.id)
  );

  -- Same reason as migration 013: photos.tagged_members is a uuid[] with no
  -- foreign key, so nothing else would ever clear the id out of it.
  update photos
  set tagged_members = array_remove(tagged_members, v_me.id)
  where v_me.id = any(tagged_members);
  get diagnostics v_count = row_count;
  v_report := v_report || jsonb_build_object('photos_untagged', v_count);

  delete from members where id = v_me.id;

  return v_report;
end;
$$;

comment on function delete_my_account() is
  'Permanently deletes the calling member and everything cascading from them. Takes no argument: the target is always the caller. Refuses only for the last remaining admin, who must hand the role over first.';

revoke execute on function delete_my_account() from public;
grant execute on function delete_my_account() to authenticated;
