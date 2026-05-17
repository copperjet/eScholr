-- ============================================================
-- 062_hr_core.sql — HR Module Phase 1
-- Extended staff profile, staff_documents, staff_certifications,
-- staff_role_assignments. Cert-expiry notification trigger event.
-- ============================================================

-- ── 1. Extend staff table ──────────────────────────────────────────────────────

-- Fields that existed in app code but were missing from schema
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS position              TEXT,
  ADD COLUMN IF NOT EXISTS hire_date             DATE,
  ADD COLUMN IF NOT EXISTS photo_url             TEXT,
  ADD COLUMN IF NOT EXISTS national_id           TEXT,
  ADD COLUMN IF NOT EXISTS address               TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS employment_type       TEXT
    CHECK (employment_type IN ('full_time','part_time','contract','substitute'));

-- New HR fields
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS staff_type            TEXT
    CHECK (staff_type IN ('teacher','support','substitute','administrator')),
  ADD COLUMN IF NOT EXISTS contract_start        DATE,
  ADD COLUMN IF NOT EXISTS contract_end          DATE,
  ADD COLUMN IF NOT EXISTS manager_staff_id      UUID REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_id                TEXT,
  ADD COLUMN IF NOT EXISTS dob                   DATE,
  ADD COLUMN IF NOT EXISTS gender                TEXT
    CHECK (gender IN ('male','female','other','prefer_not_to_say')),
  ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT,
  ADD COLUMN IF NOT EXISTS bank_name             TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number   TEXT,
  ADD COLUMN IF NOT EXISTS bank_branch           TEXT,
  ADD COLUMN IF NOT EXISTS pay_type              TEXT
    CHECK (pay_type IN ('salary','hourly')),
  ADD COLUMN IF NOT EXISTS base_salary           NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS hourly_rate           NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS currency              TEXT DEFAULT 'USD';

-- ── 2. staff_documents ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  doc_type     TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  file_name    TEXT,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by  UUID REFERENCES staff(id) ON DELETE SET NULL,
  notes        TEXT
);

ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "si_staff_documents" ON staff_documents;
CREATE POLICY "si_staff_documents" ON staff_documents
  FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_staff_documents_staff  ON staff_documents(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_documents_school ON staff_documents(school_id);

-- ── 3. staff_certifications ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_certifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id      UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  cert_type     TEXT NOT NULL,
  cert_number   TEXT,
  issuing_body  TEXT,
  issue_date    DATE,
  expiry_date   DATE,
  file_url      TEXT,
  status        TEXT NOT NULL DEFAULT 'valid'
    CHECK (status IN ('valid','expiring','expired')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE staff_certifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "si_staff_certifications" ON staff_certifications;
CREATE POLICY "si_staff_certifications" ON staff_certifications
  FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_staff_certs_staff   ON staff_certifications(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_certs_school  ON staff_certifications(school_id);
CREATE INDEX IF NOT EXISTS idx_staff_certs_expiry  ON staff_certifications(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_certs_status  ON staff_certifications(school_id, status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_staff_cert_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_cert_updated_at ON staff_certifications;
CREATE TRIGGER trg_staff_cert_updated_at
  BEFORE UPDATE ON staff_certifications
  FOR EACH ROW EXECUTE FUNCTION update_staff_cert_updated_at();

-- ── 4. staff_role_assignments ────────────────────────────────────────────────
-- Supplements staff_roles: tracks stipend, date range, and allows
-- a staff member to hold multiple roles simultaneously.

CREATE TABLE IF NOT EXISTS staff_role_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  stipend_amount  NUMERIC(12,2),
  effective_from  DATE,
  effective_to    DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE staff_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "si_staff_role_assignments" ON staff_role_assignments;
CREATE POLICY "si_staff_role_assignments" ON staff_role_assignments
  FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_sra_staff  ON staff_role_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_sra_school ON staff_role_assignments(school_id);

-- ── 5. Add cert_expiry trigger_event to notification_logs ────────────────────
-- notification_logs.trigger_event has a CHECK constraint; add new value.

ALTER TABLE notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_trigger_event_check;

ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_trigger_event_check
  CHECK (trigger_event IN (
    'attendance_absent','report_released','report_updated',
    'daybook_sent','marks_unlocked','marks_complete',
    'threshold_alert','app_update','cert_expiry'
  ));
