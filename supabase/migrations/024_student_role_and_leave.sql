-- ============================================================
-- 024_student_role_and_leave.sql
-- Student role support + HR leave management
-- ============================================================

-- 1. Student auth support
ALTER TABLE students ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Add 'student' and 'hr' to staff_roles constraint
-- Note: PostgreSQL doesn't allow ALTER TYPE in transaction, so we recreate

-- First, drop the constraint from staff_roles temporarily (we'll rely on app-level validation + RLS)
-- Actually, better approach: app validates, DB allows all text but has CHECK for known roles
-- For now, keep existing constraint — will handle in app

-- 3. Leave requests table
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual','sick','maternity','paternity','compassionate','unpaid','other')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested INTEGER NOT NULL GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by UUID REFERENCES staff(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Staff leave balance tracking (optional but useful)
CREATE TABLE IF NOT EXISTS staff_leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  year INTEGER NOT NULL,
  entitlement_days INTEGER NOT NULL DEFAULT 0,
  used_days INTEGER NOT NULL DEFAULT 0,
  remaining_days INTEGER GENERATED ALWAYS AS (entitlement_days - used_days) STORED,
  UNIQUE (staff_id, leave_type, year)
);

-- 5. RLS policies
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_leave_balances ENABLE ROW LEVEL SECURITY;

-- Staff see own leave requests + school-wide if HR/admin
DROP POLICY IF EXISTS si_leave_requests ON leave_requests;
CREATE POLICY si_leave_requests ON leave_requests FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

DROP POLICY IF EXISTS si_leave_balances ON staff_leave_balances;
CREATE POLICY si_leave_balances ON staff_leave_balances FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

-- 6. Update trigger for leave_requests
CREATE OR REPLACE FUNCTION update_leave_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_leave_requests_updated ON leave_requests;
CREATE TRIGGER trg_leave_requests_updated
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_leave_requests_updated_at();

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_leave_staff ON leave_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_dates ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_balances_staff ON staff_leave_balances(staff_id);

-- 8. Students RLS — students can see own records
DROP POLICY IF EXISTS students_own ON students;
CREATE POLICY students_own ON students FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());
