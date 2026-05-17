-- ============================================================
-- 011_reports.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS report_templates (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                 UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
  show_student_photo        BOOLEAN NOT NULL DEFAULT true,
  show_class_position       BOOLEAN NOT NULL DEFAULT true,
  show_subject_teacher_name BOOLEAN NOT NULL DEFAULT true,
  hrt_signature_label       TEXT NOT NULL DEFAULT 'Class Teacher',
  head_signature_label      TEXT NOT NULL DEFAULT 'Head of School',
  footer_text               TEXT
);

CREATE TABLE IF NOT EXISTS reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  semester_id         UUID NOT NULL REFERENCES semesters(id),
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','pending_approval','approved','finance_pending','under_review','released'
  )),
  hrt_comment         TEXT CHECK (char_length(hrt_comment) <= 600),
  overall_percentage  DECIMAL(5,2),
  class_position      INTEGER,
  approved_by         UUID REFERENCES staff(id),
  approved_at         TIMESTAMPTZ,
  released_at         TIMESTAMPTZ,
  finance_cleared_by  UUID REFERENCES staff(id),
  finance_cleared_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, semester_id)
);

CREATE TABLE IF NOT EXISTS report_versions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  report_id          UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  version_number     INTEGER NOT NULL DEFAULT 1,
  approved_at        TIMESTAMPTZ NOT NULL,
  approved_by        UUID NOT NULL REFERENCES staff(id),
  pdf_url            TEXT,
  verification_token CHAR(16) UNIQUE NOT NULL,
  is_current         BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only one current version per report
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_version
  ON report_versions(report_id) WHERE is_current = true;

-- Generate verification token
CREATE OR REPLACE FUNCTION generate_verification_token()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verification_token IS NULL THEN
    NEW.verification_token := encode(gen_random_bytes(8), 'hex');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_verification_token ON report_versions;
CREATE TRIGGER trg_verification_token BEFORE INSERT ON report_versions
FOR EACH ROW EXECUTE FUNCTION generate_verification_token();

-- ── Seed report template when school created ──────────────────
CREATE OR REPLACE FUNCTION seed_report_template()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO report_templates (school_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_seed_report_template
AFTER INSERT ON schools
FOR EACH ROW EXECUTE FUNCTION seed_report_template();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_versions  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "si_report_templates" ON report_templates;
CREATE POLICY "si_report_templates" ON report_templates FOR ALL TO authenticated
  USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
DROP POLICY IF EXISTS "si_reports" ON reports;
CREATE POLICY "si_reports" ON reports FOR ALL TO authenticated
  USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
-- Report versions: read + insert only (no update/delete — immutable)
DROP POLICY IF EXISTS "si_rv_read" ON report_versions;
CREATE POLICY "si_rv_read" ON report_versions FOR SELECT TO authenticated
  USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
DROP POLICY IF EXISTS "si_rv_insert" ON report_versions;
CREATE POLICY "si_rv_insert" ON report_versions FOR INSERT TO authenticated
  WITH CHECK (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_reports_student   ON reports(student_id);
CREATE INDEX IF NOT EXISTS idx_reports_semester  ON reports(semester_id);
CREATE INDEX IF NOT EXISTS idx_reports_status    ON reports(status);
CREATE INDEX IF NOT EXISTS idx_rv_report         ON report_versions(report_id);
CREATE INDEX IF NOT EXISTS idx_rv_token          ON report_versions(verification_token);
