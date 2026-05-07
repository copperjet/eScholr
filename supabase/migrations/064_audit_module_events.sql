-- ============================================================
-- 064_audit_module_events.sql
-- Extend audit_logs event_type CHECK to include module events.
-- ============================================================

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_event_type_check;

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_event_type_check
  CHECK (event_type IN (
    'mark_entered','mark_edited','mark_locked','mark_unlocked',
    'report_approved','report_released','report_unlocked',
    'attendance_submitted','attendance_corrected',
    'finance_status_changed','bulk_action',
    'account_created','account_deactivated',
    'student_promoted','student_graduated','student_repeat_year',
    'igcse_subject_changed','platform_impersonation',
    'daybook_archived','mark_excused',
    -- Module gating events (performed by platform super_admin)
    'module_toggled','modules_bulk_updated'
  ));
