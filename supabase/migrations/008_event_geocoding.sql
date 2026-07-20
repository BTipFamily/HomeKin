-- ============================================================
-- Geocoding fields for sub_events, so individual event locations
-- (not just the overall reunion location) can be shown on the Travel Map.
-- ============================================================
-- No new RLS policies needed: covered by the existing sub_events
-- committee/admin UPDATE/INSERT policies (same pattern as 003_duration.sql).

alter table sub_events
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists geocoded_address text,
  add column if not exists geocode_updated_at timestamptz;
