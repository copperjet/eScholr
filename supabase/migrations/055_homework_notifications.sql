-- ============================================================
-- 055_homework_notifications.sql
-- Adds homework_assigned / homework_graded to notification_logs
-- constraint. Notifications are sent via edge function, not triggers.
-- ============================================================

ALTER TABLE notification_logs
DROP CONSTRAINT IF EXISTS notification_logs_trigger_event_check,
ADD CONSTRAINT notification_logs_trigger_event_check
CHECK (trigger_event IN (
  'attendance_absent','report_released','report_updated',
  'daybook_sent','marks_unlocked','marks_complete',
  'threshold_alert','app_update','homework_assigned','homework_graded'
));
