-- ============================================================
-- 081_finance_ops_layer.sql
-- Finance operations layer: payment methods, fee overrides,
-- Sage account mappings, invoice + payment_transactions extensions.
-- ============================================================

-- ── 1. payment_methods ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_methods (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  label            TEXT NOT NULL,
  sage_account_code TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_payment_methods ON payment_methods FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_pm_school ON payment_methods(school_id);

-- Seed defaults per school — called after school creation or first use
-- (app seeds these on first finance module activation)

-- ── 2. sage_account_mappings ──────────────────────────────────
-- Per-school mapping from internal keys to Sage account codes.
-- internal_key examples: 'AR', 'Revenue:Tuition', 'Revenue:Transport',
--   'Cash', 'Bank', 'Discount', 'Revenue:Uniform', 'Revenue:Lunch'
CREATE TABLE IF NOT EXISTS sage_account_mappings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  internal_key     TEXT NOT NULL,
  sage_account_code TEXT NOT NULL,
  sage_dimension   TEXT,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, internal_key)
);

ALTER TABLE sage_account_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_sage_mappings ON sage_account_mappings FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_sam_school ON sage_account_mappings(school_id);

-- ── 3. fee_schedule_assignments (per-student overrides) ───────
-- Allows scholarship / discount / custom amount per student.
CREATE TABLE IF NOT EXISTS fee_schedule_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_schedule_id  UUID NOT NULL REFERENCES fee_schedules(id) ON DELETE CASCADE,
  override_amount  DECIMAL(12,2),
  discount_pct     DECIMAL(5,2) CHECK (discount_pct >= 0 AND discount_pct <= 100),
  reason           TEXT,
  created_by       UUID REFERENCES staff(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, fee_schedule_id)
);

ALTER TABLE fee_schedule_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_fsa ON fee_schedule_assignments FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_fsa_student  ON fee_schedule_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_fsa_schedule ON fee_schedule_assignments(fee_schedule_id);
CREATE INDEX IF NOT EXISTS idx_fsa_school   ON fee_schedule_assignments(school_id);

-- ── 4. Extend payment_transactions ────────────────────────────
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS payment_method_code TEXT,
  ADD COLUMN IF NOT EXISTS reference_number     TEXT,
  ADD COLUMN IF NOT EXISTS fee_category_id      UUID REFERENCES fee_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_id           UUID REFERENCES students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS semester_id          UUID REFERENCES semesters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sage_exported        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sage_exported_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pt_student       ON payment_transactions(student_id);
CREATE INDEX IF NOT EXISTS idx_pt_semester      ON payment_transactions(semester_id);
CREATE INDEX IF NOT EXISTS idx_pt_sage_exported ON payment_transactions(school_id, sage_exported);

-- ── 5. Extend invoices ────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS sent_to_parent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sage_exported       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sage_exported_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS currency            TEXT DEFAULT 'ZMW';

-- Add student_id + semester_id to payment_transactions if missing
-- (they were in the original student-finance screen insert but not in 013 schema)
-- Already added above.

-- ── 6. Extend fee_categories with Sage mapping ────────────────
ALTER TABLE fee_categories
  ADD COLUMN IF NOT EXISTS sage_revenue_account TEXT,
  ADD COLUMN IF NOT EXISTS sort_order           INT NOT NULL DEFAULT 0;

-- ── 7. invoice_items — add fee_category_id if missing ─────────
-- Already exists per 025 but ensure FK is there
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS sage_exported BOOLEAN NOT NULL DEFAULT false;

-- ── 8. Module config defaults for finance ops ─────────────────
-- Insert default payment methods for existing schools
-- (idempotent — UNIQUE on school_id + code)
-- Done at app level via seed function rather than migration
-- to avoid iterating all schools in SQL.

-- ── 9. Updated_at trigger for sage_account_mappings ──────────
CREATE OR REPLACE FUNCTION update_sam_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_sam_updated_at ON sage_account_mappings;
CREATE TRIGGER trg_sam_updated_at
  BEFORE UPDATE ON sage_account_mappings
  FOR EACH ROW EXECUTE FUNCTION update_sam_updated_at();
