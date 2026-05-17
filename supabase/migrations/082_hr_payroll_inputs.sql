-- ============================================================
-- 082_hr_payroll_inputs.sql
-- HR payroll inputs — pay periods, timesheets, adjustments.
-- eScholr collects gross pay inputs; Sage computes net/tax/payslips.
-- ============================================================

-- ── 1. pay_periods ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  period_label  TEXT NOT NULL,               -- e.g. "2026-05" or "May 2026"
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','locked','exported')),
  locked_at     TIMESTAMPTZ,
  locked_by     UUID REFERENCES staff(id),
  exported_at   TIMESTAMPTZ,
  exported_by   UUID REFERENCES staff(id),
  export_url    TEXT,                        -- URL of generated CSV in storage
  created_by    UUID REFERENCES staff(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, period_label)
);

ALTER TABLE pay_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_pay_periods ON pay_periods FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_pp_school_status ON pay_periods(school_id, status);
CREATE INDEX IF NOT EXISTS idx_pp_dates ON pay_periods(school_id, start_date DESC);

-- ── 2. staff_timesheets (hourly staff only) ───────────────────
CREATE TABLE IF NOT EXISTS staff_timesheets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  pay_period_id   UUID NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  hours_worked    NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (hours_worked >= 0),
  overtime_hours  NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0),
  notes           TEXT,
  entered_by      UUID REFERENCES staff(id),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, pay_period_id)
);

ALTER TABLE staff_timesheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_staff_timesheets ON staff_timesheets FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_st_period ON staff_timesheets(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_st_staff  ON staff_timesheets(staff_id);

-- ── 3. staff_pay_adjustments ──────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_pay_adjustments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  pay_period_id   UUID NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL
    CHECK (kind IN ('bonus','deduction','advance','reimbursement','stipend','other')),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason          TEXT,
  created_by      UUID REFERENCES staff(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE staff_pay_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_staff_pay_adj ON staff_pay_adjustments FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_spa_period ON staff_pay_adjustments(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_spa_staff  ON staff_pay_adjustments(staff_id);

-- ── 4. staff_leave_unpaid_days (view) ─────────────────────────
-- Computes unpaid leave days approved per staff.
-- Schema (migration 024): leave_requests.leave_type is TEXT enum.
-- Only 'unpaid' is treated as deductible; days_requested is a
-- generated column (end_date - start_date + 1).
CREATE OR REPLACE VIEW staff_leave_unpaid_days AS
SELECT
  lr.school_id,
  lr.staff_id,
  lr.approved_at,
  lr.days_requested::INT AS unpaid_days,
  lr.start_date,
  lr.end_date
FROM leave_requests lr
WHERE lr.status = 'approved'
  AND lr.leave_type = 'unpaid';

-- ── 5. payroll_export_log ─────────────────────────────────────
-- Tracks each payroll CSV export per pay period.
CREATE TABLE IF NOT EXISTS payroll_exports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  pay_period_id   UUID NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  file_url        TEXT,
  staff_count     INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success','partial','failed')),
  error_message   TEXT,
  created_by      UUID REFERENCES staff(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payroll_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_payroll_exports ON payroll_exports FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_pe_period ON payroll_exports(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_pe_school ON payroll_exports(school_id, created_at DESC);

-- ── 6. Timesheet updated_at trigger ──────────────────────────
CREATE OR REPLACE FUNCTION update_timesheet_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_timesheet_updated_at ON staff_timesheets;
CREATE TRIGGER trg_timesheet_updated_at
  BEFORE UPDATE ON staff_timesheets
  FOR EACH ROW EXECUTE FUNCTION update_timesheet_updated_at();

-- ── 7. Sage payroll sync queue enqueue on pay period export ───
-- Payroll events are enqueued when a pay period is exported (done
-- in the export-payroll-csv edge function, not via DB trigger,
-- since we batch per staff into a single export row).
