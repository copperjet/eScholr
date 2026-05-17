-- ============================================================
-- 028_leave_balance_trigger_and_rls.sql
-- 1. Fix leave RLS policies to scope by school_id (prevent cross-school leak)
-- 2. Auto-decrement leave balance when leave is approved
-- 3. Add student_email_domain default config
-- ============================================================

-- ── 1. Fix leave_requests RLS — add school_id scoping ────────────

DROP POLICY IF EXISTS leave_select ON leave_requests;
CREATE POLICY leave_select ON leave_requests FOR SELECT TO authenticated
  USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (
      staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
      OR EXISTS (
        SELECT 1 FROM staff_roles sr
        WHERE sr.staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
        AND sr.role IN ('hr', 'admin', 'super_admin')
      )
    )
  );

DROP POLICY IF EXISTS leave_insert ON leave_requests;
CREATE POLICY leave_insert ON leave_requests FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
  );

DROP POLICY IF EXISTS leave_update_own ON leave_requests;
CREATE POLICY leave_update_own ON leave_requests FOR UPDATE TO authenticated
  USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
    AND status = 'pending'
  );

DROP POLICY IF EXISTS leave_update_hr ON leave_requests;
CREATE POLICY leave_update_hr ON leave_requests FOR UPDATE TO authenticated
  USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND EXISTS (
      SELECT 1 FROM staff_roles sr
      WHERE sr.staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
      AND sr.role IN ('hr', 'admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS leave_delete ON leave_requests;
CREATE POLICY leave_delete ON leave_requests FOR DELETE TO authenticated
  USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND EXISTS (
      SELECT 1 FROM staff_roles sr
      WHERE sr.staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
      AND sr.role IN ('hr', 'admin', 'super_admin')
    )
  );

-- ── 2. Auto-update used_days when leave is approved ──────────────

CREATE OR REPLACE FUNCTION update_leave_balance_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only fire when status changes to 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE staff_leave_balances
       SET used_days = used_days + NEW.days_requested
     WHERE staff_id  = NEW.staff_id
       AND leave_type = NEW.leave_type
       AND year = EXTRACT(YEAR FROM NEW.start_date)::integer;
  END IF;

  -- Reverse if changed away from approved (e.g. cancelled after approval)
  IF OLD.status = 'approved' AND NEW.status != 'approved' THEN
    UPDATE staff_leave_balances
       SET used_days = GREATEST(used_days - OLD.days_requested, 0)
     WHERE staff_id  = OLD.staff_id
       AND leave_type = OLD.leave_type
       AND year = EXTRACT(YEAR FROM OLD.start_date)::integer;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_balance_on_approval ON leave_requests;
CREATE TRIGGER trg_leave_balance_on_approval
  AFTER UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_leave_balance_on_approval();

-- ── 3. Seed student_email_domain config for existing schools ─────

-- Add to seed function for new schools
CREATE OR REPLACE FUNCTION seed_school_configs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO school_configs (school_id, config_key, config_value) VALUES
    (NEW.id, 'report_comment_max_chars', '600'),
    (NEW.id, 'attendance_threshold_pct', '85'),
    (NEW.id, 'school_phone',             ''),
    (NEW.id, 'school_email',             ''),
    (NEW.id, 'school_address',           ''),
    (NEW.id, 'school_motto',             ''),
    (NEW.id, 'school_website',           ''),
    (NEW.id, 'currency',                 'ZMW'),
    (NEW.id, 'timezone',                 'Africa/Lusaka'),
    (NEW.id, 'marks_entry_deadline',     '7'),
    (NEW.id, 'parent_finance_visible',   'true'),
    (NEW.id, 'parent_marks_visible',     'true'),
    (NEW.id, 'biometric_login_enabled',  'true'),
    (NEW.id, 'push_notifications_on',    'true'),
    (NEW.id, 'student_email_domain',     'students.escholr.com')
  ON CONFLICT (school_id, config_key) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Backfill for existing schools that don't have it yet
INSERT INTO school_configs (school_id, config_key, config_value)
  SELECT id, 'student_email_domain', 'students.escholr.com'
  FROM schools
  WHERE id NOT IN (
    SELECT school_id FROM school_configs WHERE config_key = 'student_email_domain'
  )
ON CONFLICT (school_id, config_key) DO NOTHING;
