-- ============================================================
-- 027_leave_rls_fix.sql
-- Tighten leave_requests RLS policies for security
-- ============================================================

-- Drop old permissive policy
DROP POLICY IF EXISTS si_leave_requests ON leave_requests;

-- Policy 1: Staff can see own leave requests + HR/admin can see all
CREATE POLICY leave_select ON leave_requests FOR SELECT TO authenticated
  USING (
    -- Own requests
    staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
    -- Or HR/admin roles
    OR EXISTS (
      SELECT 1 FROM staff_roles sr
      WHERE sr.staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
      AND sr.role IN ('hr', 'admin', 'super_admin')
    )
  );

-- Policy 2: Staff can only insert their own leave requests
CREATE POLICY leave_insert ON leave_requests FOR INSERT TO authenticated
  WITH CHECK (
    staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
  );

-- Policy 3: Staff can update own pending requests only
CREATE POLICY leave_update_own ON leave_requests FOR UPDATE TO authenticated
  USING (
    staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
    AND status = 'pending'
  );

-- Policy 4: HR/admin can update any request (for approval/rejection)
CREATE POLICY leave_update_hr ON leave_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_roles sr
      WHERE sr.staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
      AND sr.role IN ('hr', 'admin', 'super_admin')
    )
  );

-- Policy 5: Only HR/admin can delete
CREATE POLICY leave_delete ON leave_requests FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_roles sr
      WHERE sr.staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
      AND sr.role IN ('hr', 'admin', 'super_admin')
    )
  );
