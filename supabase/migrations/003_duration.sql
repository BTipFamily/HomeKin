-- Add approximate duration (in minutes) to sub_events
ALTER TABLE sub_events ADD COLUMN IF NOT EXISTS duration_minutes integer;
