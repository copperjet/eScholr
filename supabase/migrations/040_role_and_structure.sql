-- ============================================================
-- 040_role_and_structure.sql
-- Phase C + D groundwork:
--  • Add 'school_super_admin' role (school-scoped tier above admin)
--  • Add subjects.code (CAIE / curriculum code) for cleaner subject mgmt
--  • Add school_super_admin to ROLE access patterns (handled client-side)
-- ============================================================

-- ── staff_roles: expand CHECK to allow school_super_admin ─────
ALTER TABLE staff_roles
  DROP CONSTRAINT IF EXISTS staff_roles_role_check;

ALTER TABLE staff_roles
  ADD CONSTRAINT staff_roles_role_check
  CHECK (role IN (
    'super_admin','school_super_admin','admin','front_desk','finance',
    'hr','principal','coordinator','hod','hrt','st'
  ));

-- ── subjects: add curriculum code ──────────────────────────────
-- Cambridge / IB / national-curriculum subject codes (e.g. '0625' for IGCSE Physics).
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS code TEXT;

CREATE INDEX IF NOT EXISTS idx_subjects_code
  ON subjects(school_id, code) WHERE code IS NOT NULL;
