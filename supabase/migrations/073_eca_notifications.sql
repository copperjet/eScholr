-- ============================================================
-- 073_eca_notifications.sql
-- Add ECA trigger_event values to notification_logs constraint
-- ============================================================

ALTER TABLE notification_logs
  DROP CONSTRAINT IF EXISTS notification_logs_trigger_event_check;

ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_trigger_event_check
  CHECK (trigger_event IN (
    'attendance_absent','report_released','report_updated',
    'daybook_sent','marks_unlocked','marks_complete',
    'threshold_alert','app_update','homework_assigned','homework_graded',
    'cert_expiry',
    'eca_choices_open','eca_assignment_made','eca_session_reminder',
    'eca_promoted_from_waitlist'
  ));
