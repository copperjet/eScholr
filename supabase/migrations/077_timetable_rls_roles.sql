-- ============================================================
-- 077_timetable_rls_roles.sql — R1.9 + R1.10
-- Role-gated write RLS for all timetabling tables.
-- Replaces the FOR-ALL tenant-only policies from 075/076
-- with separate READ (any tenant) + WRITE (admin roles) policies.
-- Also adds updated_at triggers on timetables + timetable_slots.
-- ============================================================

-- Helper: arrays of tables by write-permission level
-- Level A: admin/principal/coordinator write only
-- Level B: also allow HRT/ST to write their own rows (teacher prefs, swaps)

-- ── 1. Core scheduling tables — admin write ──────────────────

DO $$
DECLARE
  t TEXT;
  admin_roles TEXT[] := ARRAY['super_admin','school_super_admin','admin','principal','coordinator'];
BEGIN
  -- All tables in this loop must own a `school_id` column.
  -- `timetable_conflicts` has no `school_id` (scoped via timetable_id);
  -- handled separately below.
  FOR t IN SELECT unnest(ARRAY[
    'rooms',
    'timetable_periods',
    'timetable_settings',
    'subject_period_requirements',
    'timetables',
    'timetable_slots',
    'timetable_generation_runs',
    'subject_colors',
    'teacher_absences',
    'slot_overrides'
  ]) LOOP
    -- Drop old catch-all policy
    EXECUTE format('DROP POLICY IF EXISTS "si_%I" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I tenant read" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I admin write" ON %I', t, t);

    -- Tenant read: any authenticated user in this school
    EXECUTE format(
      'CREATE POLICY "%I_read" ON %I
       FOR SELECT TO authenticated
       USING (school_id = (auth.jwt()->''app_metadata''->>''school_id'')::uuid)',
      t, t
    );

    -- Admin write: insert/update/delete gated on role membership
    EXECUTE format(
      'CREATE POLICY "%I_write" ON %I
       FOR ALL TO authenticated
       USING (
         school_id = (auth.jwt()->''app_metadata''->>''school_id'')::uuid
         AND (auth.jwt()->''app_metadata''->''roles'') ?| array[%L]
       )
       WITH CHECK (
         school_id = (auth.jwt()->''app_metadata''->>''school_id'')::uuid
         AND (auth.jwt()->''app_metadata''->''roles'') ?| array[%L]
       )',
      t, t, admin_roles, admin_roles
    );
  END LOOP;
END $$;

-- ── 1b. timetable_conflicts — no school_id; scope via timetable_id ─

DROP POLICY IF EXISTS "si_timetable_conflicts"       ON timetable_conflicts;
DROP POLICY IF EXISTS "timetable_conflicts_read"     ON timetable_conflicts;
DROP POLICY IF EXISTS "timetable_conflicts_write"    ON timetable_conflicts;

CREATE POLICY "timetable_conflicts_read"
  ON timetable_conflicts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM timetables t
      WHERE t.id = timetable_conflicts.timetable_id
        AND t.school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    )
  );

CREATE POLICY "timetable_conflicts_write"
  ON timetable_conflicts FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM timetables t
      WHERE t.id = timetable_conflicts.timetable_id
        AND t.school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    )
    AND (auth.jwt()->'app_metadata'->'roles')
        ?| array['super_admin','school_super_admin','admin','principal','coordinator']
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM timetables t
      WHERE t.id = timetable_conflicts.timetable_id
        AND t.school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    )
    AND (auth.jwt()->'app_metadata'->'roles')
        ?| array['super_admin','school_super_admin','admin','principal','coordinator']
  );

-- ── 2. teacher_constraints — teachers read+write own row ─────

DROP POLICY IF EXISTS "si_teacher_constraints" ON teacher_constraints;
DROP POLICY IF EXISTS "teacher_constraints_read" ON teacher_constraints;
DROP POLICY IF EXISTS "teacher_constraints_write" ON teacher_constraints;
DROP POLICY IF EXISTS "teacher_constraints_self_write" ON teacher_constraints;

CREATE POLICY "teacher_constraints_read"
  ON teacher_constraints FOR SELECT TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE POLICY "teacher_constraints_write"
  ON teacher_constraints FOR ALL TO authenticated
  USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (
      (auth.jwt()->'app_metadata'->'roles') ?| array['super_admin','school_super_admin','admin','principal','coordinator']
      OR staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
    )
  )
  WITH CHECK (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (
      (auth.jwt()->'app_metadata'->'roles') ?| array['super_admin','school_super_admin','admin','principal','coordinator']
      OR staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
    )
  );

-- ── 3. teacher_availability — teachers manage their own ──────

DROP POLICY IF EXISTS "si_teacher_availability" ON teacher_availability;
DROP POLICY IF EXISTS "teacher_availability_read" ON teacher_availability;
DROP POLICY IF EXISTS "teacher_availability_write" ON teacher_availability;

CREATE POLICY "teacher_availability_read"
  ON teacher_availability FOR SELECT TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE POLICY "teacher_availability_write"
  ON teacher_availability FOR ALL TO authenticated
  USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (
      (auth.jwt()->'app_metadata'->'roles') ?| array['super_admin','school_super_admin','admin','principal','coordinator']
      OR staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
    )
  )
  WITH CHECK (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (
      (auth.jwt()->'app_metadata'->'roles') ?| array['super_admin','school_super_admin','admin','principal','coordinator']
      OR staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
    )
  );

-- ── 4. slot_swap_requests — teachers can create own requests ─

DROP POLICY IF EXISTS "si_slot_swap_requests" ON slot_swap_requests;
DROP POLICY IF EXISTS "slot_swap_requests_read" ON slot_swap_requests;
DROP POLICY IF EXISTS "slot_swap_requests_insert" ON slot_swap_requests;
DROP POLICY IF EXISTS "slot_swap_requests_admin" ON slot_swap_requests;

CREATE POLICY "slot_swap_requests_read"
  ON slot_swap_requests FOR SELECT TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

-- Teachers may insert their own swap requests
CREATE POLICY "slot_swap_requests_insert"
  ON slot_swap_requests FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND requester_staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
  );

-- Admins + target teachers may update (approve/reject)
CREATE POLICY "slot_swap_requests_update"
  ON slot_swap_requests FOR UPDATE TO authenticated
  USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (
      (auth.jwt()->'app_metadata'->'roles') ?| array['super_admin','school_super_admin','admin','principal','coordinator']
      OR target_staff_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
    )
  );

-- ── 5. updated_at triggers (R1.10) ───────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_timetables_updated_at ON timetables;
CREATE TRIGGER trg_timetables_updated_at
  BEFORE UPDATE ON timetables
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_timetable_slots_updated_at ON timetable_slots;
CREATE TRIGGER trg_timetable_slots_updated_at
  BEFORE UPDATE ON timetable_slots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
