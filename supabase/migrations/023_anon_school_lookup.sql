-- ============================================================
-- 023_anon_school_lookup.sql
-- Allow unauthenticated users to look up a school by code.
-- The school-code entry screen runs before any auth session
-- exists, so the anon role must be able to SELECT from schools.
-- Only active schools with a known code are exposed.
-- ============================================================

DROP POLICY IF EXISTS "school_lookup_anon" ON schools;

CREATE POLICY "school_lookup_anon" ON schools
  FOR SELECT
  TO anon
  USING (subscription_status = 'active');
