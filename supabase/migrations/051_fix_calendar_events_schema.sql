-- ============================================================
-- 051_fix_calendar_events_schema.sql
-- Fix schema mismatch: calendar_events table has event_type (003/039)
-- but code expects type (041). Migrate column and add missing columns.
-- ============================================================

-- Add missing columns that exist in 041 schema but not in 003/039
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS type TEXT;

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS color TEXT;

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS all_day BOOLEAN NOT NULL DEFAULT true;

-- Migrate data from event_type to type if type is null
UPDATE calendar_events SET type = event_type WHERE type IS NULL;

-- Set default type for any remaining nulls
UPDATE calendar_events SET type = 'other' WHERE type IS NULL;

-- Make type NOT NULL after backfill
ALTER TABLE calendar_events
  ALTER COLUMN type SET NOT NULL;

-- Drop old event_type column (no longer needed)
ALTER TABLE calendar_events
  DROP COLUMN IF EXISTS event_type;

-- Update CHECK constraint for type column
ALTER TABLE calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_type_check,
  DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;

ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_type_check
  CHECK (type IN ('holiday', 'break', 'event', 'exam'));

-- Drop academic_year_id constraint to allow ad-hoc events (from 039)
ALTER TABLE calendar_events
  ALTER COLUMN academic_year_id DROP NOT NULL;

-- Ensure affects_attendance and is_active exist (from 039)
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS affects_attendance BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Recreate indexes for performance
DROP INDEX IF EXISTS calendar_events_school_idx;
DROP INDEX IF EXISTS calendar_events_school_start_idx;

CREATE INDEX IF NOT EXISTS calendar_events_school_idx ON calendar_events(school_id);
CREATE INDEX IF NOT EXISTS calendar_events_school_start_idx ON calendar_events(school_id, start_date);

-- Update RLS policies to match 041
DROP POLICY IF EXISTS "calendar_events tenant read" ON calendar_events;
DROP POLICY IF EXISTS "calendar_events admin write" ON calendar_events;
DROP POLICY IF EXISTS "si_calendar_events" ON calendar_events;

-- Tenant read policy
CREATE POLICY "calendar_events tenant read"
  ON calendar_events FOR SELECT TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

-- Admin write policy (all operations)
CREATE POLICY "calendar_events admin write"
  ON calendar_events FOR ALL TO authenticated
  USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['super_admin','school_super_admin','admin','principal','coordinator']
  )
  WITH CHECK (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| array['super_admin','school_super_admin','admin','principal','coordinator']
  );
