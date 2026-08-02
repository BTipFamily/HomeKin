-- ============================================================
-- Video in the album, not just stills
-- ============================================================
--
-- Phones shoot video by default and the album silently refused it: the
-- uploader filtered selections to image/*, so a member picking a clip of the
-- kids in the pool watched it vanish with no explanation at all.
--
-- The table keeps the name `photos`. Renaming it to `media` would touch three
-- hand-maintained SQL functions, every query, the type file and the README,
-- for no behavioural gain. The name is now a mild lie — worth saying out loud
-- here rather than leaving the next person to work it out.

alter table photos
  -- Defaulting to 'image' backfills every existing row correctly, so there is
  -- no data migration and no window where a row's type is unknown.
  add column media_type text not null default 'image'
    check (media_type in ('image', 'video')),
  -- A poster frame, captured in the browser at upload time. Null for images,
  -- and null for a video whose capture failed — the grid falls back rather
  -- than refusing to show the row.
  add column thumbnail_path text,
  add column duration_seconds integer check (duration_seconds is null or duration_seconds >= 0);

comment on column photos.media_type is
  'Whether storage_path points at a still or a clip. Images predate this column and default to ''image''.';
comment on column photos.thumbnail_path is
  'Poster frame for a video, in the same bucket. Null for images. Must be swept alongside storage_path on delete.';

-- ---- The bucket ----
-- 005 creates the buckets with `on conflict (id) do nothing`, which means
-- editing that file does nothing at all to a bucket that already exists. This
-- has to be an explicit update or video uploads fail at the storage layer with
-- an opaque error while the app happily believes it sent them.
--
-- video/quicktime is what iPhones actually produce; leaving it out would
-- reject the single most likely upload.
update storage.buckets
set
  file_size_limit = 104857600, -- 100 MB; mirrored by MAX_VIDEO_BYTES in src/lib/media.ts
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
where id = 'photos';

-- ============================================================
-- delete_reunion has to sweep the posters too
-- ============================================================
--
-- The function hands back photo storage paths so the caller can clear the
-- bucket, because the rows cascade away and take the paths with them. A video
-- row owns two objects, and the poster was not in that list — it would sit in
-- the bucket forever, costing storage, belonging to a reunion that no longer
-- exists, and invisible to everything that might otherwise notice.
--
-- Reproduced from 014 with one changed expression: 'storage_paths' now unions
-- thumbnail_path. Everything else is verbatim.

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
    -- Both objects a row can own: the media itself and, for a video, its
    -- poster frame.
    'storage_paths', coalesce(
      (
        select jsonb_agg(path)
        from (
          select storage_path as path from photos where reunion_id = p_reunion
          union all
          select thumbnail_path from photos
          where reunion_id = p_reunion and thumbnail_path is not null
        ) paths
      ),
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
  'Permanently deletes a reunion and everything cascading from it. Admin only. Returns the photo and video storage paths the caller must remove from the bucket.';

revoke execute on function delete_reunion(uuid) from public;
grant execute on function delete_reunion(uuid) to authenticated;
