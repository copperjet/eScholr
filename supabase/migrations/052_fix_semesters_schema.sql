-- ============================================================
-- 052_fix_semesters_schema.sql
-- Fix schema mismatch on semesters table:
--   • Code inserts an 'academic_year' TEXT column that doesn't exist
--   • academic_year_id is NOT NULL but code never provides it
-- This caused the "Create Semester" button to silently fail on web
-- (React Native Alert.alert doesn't render in browsers).
-- ============================================================

-- Add academic_year TEXT column used by the app code
ALTER TABLE semesters
  ADD COLUMN IF NOT EXISTS academic_year TEXT;

-- Backfill from academic_years.name where possible
UPDATE semesters s
   SET academic_year = ay.name
  FROM academic_years ay
 WHERE s.academic_year_id = ay.id
   AND s.academic_year IS NULL;

-- Default for any remaining NULLs (legacy rows)
UPDATE semesters
   SET academic_year = EXTRACT(YEAR FROM start_date)::TEXT
 WHERE academic_year IS NULL;

ALTER TABLE semesters
  ALTER COLUMN academic_year SET NOT NULL;

-- Make academic_year_id nullable so ad-hoc semesters can be created
-- without first creating an academic_years row.
ALTER TABLE semesters
  ALTER COLUMN academic_year_id DROP NOT NULL;
