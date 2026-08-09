-- ============================================================
-- Let the committee remove a survey
-- ============================================================
--
-- surveys shipped with SELECT and INSERT policies and no DELETE, so a survey
-- posted by mistake — a duplicate, a typo in every question, one aimed at the
-- wrong reunion — stayed on the list permanently with no way to take it down.
--
-- Committee and admin, matching who can create one. Roles here are global
-- rather than per-reunion, which is the same reach they already have to delete
-- an event and its signups (migration 004).
--
-- survey_responses has `on delete cascade` on survey_id, so removing a survey
-- takes every answer with it. That is the intent — an orphaned answer to a
-- question nobody can read is worse than none — but it means this policy is
-- destructive well beyond the one row it names, and the caller is expected to
-- say how many responses are about to go. See deleteSurvey in
-- lib/actions/surveys.ts.
--
-- Members get no delete of their own: a response belongs to the person who
-- wrote it, but the survey belongs to whoever is running the reunion.

create policy "Surveys: committee/admin can delete" on surveys
  for delete to authenticated
  using (get_my_role() in ('committee', 'admin'));
