-- ============================================================
-- 014_notifications.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  recipient_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_event      TEXT NOT NULL CHECK (trigger_event IN (
    'attendance_absent','report_released','report_updated',
    'daybook_sent','marks_unlocked','marks_complete',
    'threshold_alert','app_update'
  )),
  channel            TEXT NOT NULL CHECK (channel IN ('push','in_app')),
  title              TEXT NOT NULL,
  body               TEXT NOT NULL,
  deep_link_url      TEXT,
  delivery_status    TEXT NOT NULL DEFAULT 'delivered'
    CHECK (delivery_status IN ('delivered','failed','no_device_registered')),
  is_safeguarding    BOOLEAN NOT NULL DEFAULT false,
  is_read            BOOLEAN NOT NULL DEFAULT false,
  related_student_id UUID REFERENCES students(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '90 days')
);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Own notifications
DROP POLICY IF EXISTS "notif_own" ON notification_logs;
CREATE POLICY "notif_own" ON notification_logs FOR SELECT TO authenticated
  USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND recipient_user_id = auth.uid()
  );

-- Admin sees all in school (for delivery log)
DROP POLICY IF EXISTS "notif_admin_read" ON notification_logs;
CREATE POLICY "notif_admin_read" ON notification_logs FOR SELECT TO authenticated
  USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ? 'admin'
  );

-- Any authenticated user in school can insert (Edge Functions)
DROP POLICY IF EXISTS "notif_insert" ON notification_logs;
CREATE POLICY "notif_insert" ON notification_logs FOR INSERT TO authenticated
  WITH CHECK (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

-- Mark as read: own only
DROP POLICY IF EXISTS "notif_update_own" ON notification_logs;
CREATE POLICY "notif_update_own" ON notification_logs FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notif_recipient  ON notification_logs(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notif_school     ON notification_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_notif_read       ON notification_logs(is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notif_expires    ON notification_logs(expires_at);
CREATE INDEX IF NOT EXISTS idx_notif_student    ON notification_logs(related_student_id);
CREATE INDEX IF NOT EXISTS idx_notif_safeguard  ON notification_logs(is_safeguarding) WHERE is_safeguarding = true;
