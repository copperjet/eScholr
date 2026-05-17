-- ============================================================
-- 070_rbac_frontdesk_students.sql
-- Front desk RBAC: rely on existing school-scoped policies
-- (005 si_staff/si_parents, 006 si_students/si_student_parent_links,
-- 016 si_inquiries, 035 staff_manage_applications) which already
-- grant authenticated users in the same school full CRUD on these
-- tables. The front_desk role is enforced at the application layer
-- (route guards in (frontdesk)/_layout.tsx) and via JWT-driven
-- school scoping at the DB layer.
--
-- This migration is intentionally minimal:
--   1. Ensure inquiries.converted_student_id exists (it was added
--      in 016 — IF NOT EXISTS makes this a safe no-op).
--   2. Add a helpful index for converted-inquiry lookups.
-- ============================================================

ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS converted_student_id uuid REFERENCES students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inquiries_converted_student
  ON inquiries(converted_student_id)
  WHERE converted_student_id IS NOT NULL;

-- Link inquiries to the application created from them (used by
-- the "Create Application from Inquiry" flow in front desk UI).
-- Already present in 035? No — admissions_applications.inquiry_id
-- was created in 035, but no index. Add one.
CREATE INDEX IF NOT EXISTS idx_admissions_apps_inquiry
  ON admissions_applications(inquiry_id)
  WHERE inquiry_id IS NOT NULL;
