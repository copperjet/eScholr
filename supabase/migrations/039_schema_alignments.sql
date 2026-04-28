-- ============================================================
-- 039_schema_alignments.sql
-- Fixes schema drift between client hooks and DB tables:
--  • reports: add pdf_url cache column (was queried on reports
--    but only existed on report_versions)
--  • calendar_events: add affects_attendance, is_active flags
--    used by the admin Academic Calendar screen
--  • calendar_events: expand event_type CHECK to include
--    'event' and 'marks_window' that the UI emits
--  • calendar_events: make academic_year_id nullable so an
--    ad-hoc event/holiday can be added without picking a year
-- ============================================================

-- ── reports.pdf_url ────────────────────────────────────────────
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Backfill from latest current report_version PDF url
UPDATE reports r
   SET pdf_url = rv.pdf_url
  FROM report_versions rv
 WHERE rv.report_id = r.id
   AND rv.is_current = true
   AND r.pdf_url IS NULL
   AND rv.pdf_url IS NOT NULL;

-- Keep reports.pdf_url in sync when a new current version is inserted.
CREATE OR REPLACE FUNCTION sync_report_pdf_url()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_current = true AND NEW.pdf_url IS NOT NULL THEN
    UPDATE reports SET pdf_url = NEW.pdf_url WHERE id = NEW.report_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_report_pdf_url ON report_versions;
CREATE TRIGGER trg_sync_report_pdf_url
AFTER INSERT OR UPDATE OF is_current, pdf_url ON report_versions
FOR EACH ROW EXECUTE FUNCTION sync_report_pdf_url();

-- ── calendar_events ────────────────────────────────────────────
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS affects_attendance BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Allow ad-hoc events (no AY required)
ALTER TABLE calendar_events
  ALTER COLUMN academic_year_id DROP NOT NULL;

-- Expand event_type CHECK
ALTER TABLE calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;

ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_event_type_check
  CHECK (event_type IN (
    'event','holiday','exam_period','parent_evening','marks_window','other'
  ));

-- ── platform admin login attempt log ──────────────────────────
-- Tracks every attempt at the platform-admin sign-in surface so
-- we can audit unauthorised access. Insert allowed without auth
-- (the page itself is unauthenticated). Read restricted to
-- service_role / platform admins.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT,
  success     BOOLEAN NOT NULL DEFAULT false,
  ip_address  TEXT,
  user_agent  TEXT,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_login_attempts ENABLE ROW LEVEL SECURITY;

-- Anonymous + authenticated can INSERT (logging only, no read)
DROP POLICY IF EXISTS "ala_insert_any" ON admin_login_attempts;
CREATE POLICY "ala_insert_any" ON admin_login_attempts
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- No SELECT/UPDATE/DELETE policy → only service_role can read.

CREATE INDEX IF NOT EXISTS idx_ala_created ON admin_login_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ala_email   ON admin_login_attempts(email);
