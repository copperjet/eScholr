-- ============================================================
-- 035_public_surfaces.sql — Public admissions + visitor log
-- Phase D: Public-facing features
-- ============================================================

-- ── 1. Admissions applications (public-facing) ──────────────

CREATE TABLE IF NOT EXISTS admissions_applications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  -- Student info
  student_name          TEXT NOT NULL,
  date_of_birth         DATE,
  gender                TEXT CHECK (gender IN ('male','female','other')),
  nationality           TEXT,
  -- Parent / guardian info
  parent_name           TEXT NOT NULL,
  parent_email          TEXT,
  parent_phone          TEXT,
  parent_relationship   TEXT DEFAULT 'parent' CHECK (parent_relationship IN ('parent','guardian','other')),
  -- Academic
  grade_applying_for    TEXT,
  previous_school       TEXT,
  -- Documents
  documents_url         TEXT,
  -- Workflow
  status                TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','reviewing','accepted','waitlisted','rejected','enrolled')),
  reviewed_by           UUID REFERENCES staff(id),
  reviewed_at           TIMESTAMPTZ,
  notes                 TEXT,
  -- Link to inquiry if converted from front desk inquiry
  inquiry_id            UUID REFERENCES inquiries(id),
  -- Link to student if enrolled
  converted_student_id  UUID REFERENCES students(id),
  -- Timestamps
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: anon can INSERT (public form), authenticated staff can SELECT/UPDATE
ALTER TABLE admissions_applications ENABLE ROW LEVEL SECURITY;

-- Public: anyone can submit an application (anon insert)
DROP POLICY IF EXISTS "anon_submit_application" ON admissions_applications;
CREATE POLICY "anon_submit_application" ON admissions_applications
  FOR INSERT TO anon
  WITH CHECK (true);

-- Staff: can read and update applications for their school
DROP POLICY IF EXISTS "staff_manage_applications" ON admissions_applications;
CREATE POLICY "staff_manage_applications" ON admissions_applications
  FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_admissions_school  ON admissions_applications(school_id);
CREATE INDEX IF NOT EXISTS idx_admissions_status  ON admissions_applications(status);
CREATE INDEX IF NOT EXISTS idx_admissions_date    ON admissions_applications(submitted_at DESC);


-- ── 2. Visitor log (front desk) ─────────────────────────────

CREATE TABLE IF NOT EXISTS visitor_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  visitor_name          TEXT NOT NULL,
  purpose               TEXT,
  contact_phone         TEXT,
  id_number             TEXT,                   -- national ID or passport
  visiting              TEXT,                   -- person or department being visited
  vehicle_reg           TEXT,                   -- optional vehicle registration
  sign_in_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  sign_out_at           TIMESTAMPTZ,
  badge_number          TEXT,                   -- issued badge number
  recorded_by           UUID NOT NULL REFERENCES staff(id),
  notes                 TEXT
);

ALTER TABLE visitor_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_visitors" ON visitor_log;
CREATE POLICY "staff_manage_visitors" ON visitor_log
  FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_visitor_school    ON visitor_log(school_id);
CREATE INDEX IF NOT EXISTS idx_visitor_date      ON visitor_log(sign_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_signout   ON visitor_log(sign_out_at) WHERE sign_out_at IS NULL;


-- ── 3. School config: enable public admissions ──────────────
-- Insert a default config key for schools that want public admissions
-- (schools opt-in by setting this to 'true')
INSERT INTO school_configs (school_id, config_key, config_value)
SELECT s.id, 'public_admissions_enabled', 'false'
FROM schools s
WHERE NOT EXISTS (
  SELECT 1 FROM school_configs sc
  WHERE sc.school_id = s.id AND sc.config_key = 'public_admissions_enabled'
)
ON CONFLICT DO NOTHING;
