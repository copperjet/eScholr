-- ============================================================
-- 015_audit.sql — Immutable audit trail
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'mark_entered','mark_edited','mark_locked','mark_unlocked',
    'report_approved','report_released','report_unlocked',
    'attendance_submitted','attendance_corrected',
    'finance_status_changed','bulk_action',
    'account_created','account_deactivated',
    'student_promoted','student_graduated','student_repeat_year',
    'igcse_subject_changed','platform_impersonation',
    'daybook_archived','mark_excused'
  )),
  actor_id    UUID REFERENCES staff(id),
  student_id  UUID REFERENCES students(id),
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS — INSERT only, no UPDATE/DELETE ───────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_insert" ON audit_logs;
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

DROP POLICY IF EXISTS "audit_read" ON audit_logs;
CREATE POLICY "audit_read" ON audit_logs FOR SELECT TO authenticated
  USING (
    school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (
      (auth.jwt()->'app_metadata'->'roles') ? 'admin'
      OR (auth.jwt()->'app_metadata'->'roles') ? 'super_admin'
    )
  );

-- No UPDATE or DELETE policies → audit logs are immutable

CREATE INDEX IF NOT EXISTS idx_audit_school    ON audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_event     ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_actor     ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_student   ON audit_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_logs(created_at DESC);
