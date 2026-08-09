-- ============================================================
-- Let a member change their own survey answers
-- ============================================================
--
-- survey_responses shipped with SELECT and INSERT policies and no UPDATE, while
-- submitSurveyResponse has always written with
--   .upsert(..., { onConflict: 'survey_id,member_id' })
--
-- The first submission inserts and succeeds. The second needs UPDATE, finds no
-- policy, and is refused — so changing your mind quietly failed. The unique
-- constraint on (survey_id, member_id) means it could never have inserted a
-- second row instead.
--
-- Scoped to your own row, in both directions: `using` decides which rows you may
-- update, `with check` stops the update itself reassigning member_id to somebody
-- else. Committee and admin can read every response but cannot rewrite one —
-- editing what a person said they wanted is not moderation.

create policy "SurveyResponses: members can revise their own" on survey_responses
  for update to authenticated
  using (member_id = get_my_member_id())
  with check (member_id = get_my_member_id());
