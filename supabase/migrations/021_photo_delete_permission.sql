-- ============================================================
-- Letting the committee delete a photo, as the app always claimed
-- ============================================================
--
-- Three places disagreed about who may remove a photo:
--
--   * photo-grid.tsx showed the delete button to committee and admin;
--   * the RLS policy allowed the uploader and admin, not committee;
--   * deletePhoto removed the row through the anon client (RLS applies) but
--     the file through the service client (RLS does not).
--
-- So a committee member deleting somebody else's photo got a silent no-op on
-- the row and a successful delete of the file: a tile that renders as broken
-- forever, that nobody — not even an admin — can clear from the UI, because
-- the only way to remove it is the button that already failed.
--
-- The storage policy in 001 already allows committee to delete objects in this
-- bucket, so the table policy was the odd one out rather than the UI being too
-- generous. Widening it here makes all three agree, and deletePhoto now stops
-- on a zero-row delete instead of proceeding to erase the file.

drop policy if exists "Photos: uploader or admin can delete" on photos;

create policy "Photos: uploader, committee or admin can delete" on photos
  for delete to authenticated
  using (
    uploaded_by = get_my_member_id()
    or get_my_role() in ('committee', 'admin')
  );
