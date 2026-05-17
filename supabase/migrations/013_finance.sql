-- ============================================================
-- 013_finance.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  semester_id UUID NOT NULL REFERENCES semesters(id),
  status      TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid','unpaid')),
  balance     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  updated_by  UUID REFERENCES staff(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, semester_id)
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  finance_record_id UUID NOT NULL REFERENCES finance_records(id) ON DELETE CASCADE,
  amount            DECIMAL(12,2) NOT NULL,
  paid_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by       UUID NOT NULL REFERENCES staff(id),
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE finance_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "si_finance"       ON finance_records      FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
CREATE POLICY "si_payments"      ON payment_transactions FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_fr_student   ON finance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_fr_semester  ON finance_records(semester_id);
CREATE INDEX IF NOT EXISTS idx_fr_status    ON finance_records(status);
CREATE INDEX IF NOT EXISTS idx_pt_record    ON payment_transactions(finance_record_id);
