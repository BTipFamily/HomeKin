-- ============================================================
-- Geocoding fields for members + reunion location
-- ============================================================
-- No new RLS policies needed: these are new columns on existing tables,
-- already covered by the existing members self-or-committee/admin UPDATE
-- policy and the existing reunions committee/admin-only UPDATE policy.

alter table members
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists geocoded_address text,
  add column if not exists geocode_updated_at timestamptz;

alter table reunions
  add column if not exists location_name text,
  add column if not exists address text,
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6);
