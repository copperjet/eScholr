-- ============================================================
-- 016_inquiry.sql — Front desk inquiries
-- ============================================================

CREATE TABLE IF NOT EXISTS inquiries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  contact_phone        TEXT,
  contact_email        TEXT,
  nature_of_inquiry    TEXT,
  date                 DATE NOT NULL DEFAULT CURRENT_DATE,
  status               TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','in_progress','enrolled','closed')),
  converted_student_id UUID REFERENCES students(id),
  created_by           UUID NOT NULL REFERENCES staff(id),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "si_inquiries" ON inquiries;
CREATE POLICY "si_inquiries" ON inquiries FOR ALL TO authenticated
  USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_inq_school  ON inquiries(school_id);
CREATE INDEX IF NOT EXISTS idx_inq_status  ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inq_date    ON inquiries(date DESC);
