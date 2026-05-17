-- ============================================================
-- 020_attendance_threshold.sql
-- Attendance threshold alert trigger + student_parent_links table
-- ============================================================

-- ── student_parent_links (needed by absence notification fn) ──
CREATE TABLE IF NOT EXISTS student_parent_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id  UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  UNIQUE (student_id, parent_id)
);

ALTER TABLE student_parent_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "si_spl" ON student_parent_links;
CREATE POLICY "si_spl" ON student_parent_links FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_spl_student ON student_parent_links(student_id);
CREATE INDEX IF NOT EXISTS idx_spl_parent  ON student_parent_links(parent_id);

-- ── Attendance threshold alert function ───────────────────────
-- Called after INSERT/UPDATE on attendance_records.
-- If a student's attendance drops below school threshold for the semester:
--   - Check if an alert was already sent this semester
--   - If not: insert notification_logs for the HRT and admin
-- Reset flag if student climbs back above threshold (handled separately).

CREATE OR REPLACE FUNCTION check_attendance_threshold()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_school_id    UUID;
  v_semester_id  UUID;
  v_threshold    INTEGER;
  v_percentage   DECIMAL;
  v_student_name TEXT;
  v_stream_id    UUID;
  v_stream_name  TEXT;
  v_already_sent BOOLEAN;
  v_hrt_user_id  UUID;
  v_admin_ids    UUID[];
  v_notif_title  TEXT;
  v_notif_body   TEXT;
BEGIN
  v_school_id   := NEW.school_id;
  v_semester_id := NEW.semester_id;
  v_stream_id   := NEW.stream_id;

  -- Get threshold from school_configs (default 85)
  SELECT COALESCE(config_value::INTEGER, 85)
  INTO   v_threshold
  FROM   school_configs
  WHERE  school_id = v_school_id
    AND  config_key = 'attendance_threshold_pct'
  LIMIT 1;

  IF v_threshold IS NULL THEN v_threshold := 85; END IF;

  -- Calculate current attendance percentage
  SELECT percentage
  INTO   v_percentage
  FROM   get_attendance_summary(NEW.student_id, v_semester_id);

  -- Only fire if below threshold
  IF v_percentage >= v_threshold THEN
    RETURN NEW;
  END IF;

  -- Check if threshold alert already sent this semester
  SELECT EXISTS (
    SELECT 1 FROM notification_logs
    WHERE  related_student_id = NEW.student_id
      AND  school_id          = v_school_id
      AND  trigger_event      = 'threshold_alert'
      AND  created_at         > (
             SELECT COALESCE(start_date, '2000-01-01'::date)
             FROM   semesters WHERE id = v_semester_id
           )
  ) INTO v_already_sent;

  IF v_already_sent THEN
    RETURN NEW;
  END IF;

  -- Get student name + stream name
  SELECT full_name INTO v_student_name FROM students WHERE id = NEW.student_id;
  SELECT name      INTO v_stream_name  FROM streams  WHERE id = v_stream_id;

  v_notif_title := v_student_name || ' — attendance alert';
  v_notif_body  := v_student_name || ' in ' || v_stream_name ||
                   ' has dropped below ' || v_threshold || '% attendance (' ||
                   ROUND(v_percentage, 1) || '% present).';

  -- Notify HRT (look up via hrt_assignments)
  SELECT s.auth_user_id
  INTO   v_hrt_user_id
  FROM   hrt_assignments ha
  JOIN   staff s ON s.id = ha.staff_id
  WHERE  ha.stream_id   = v_stream_id
    AND  ha.semester_id = v_semester_id
    AND  ha.school_id   = v_school_id
    AND  s.auth_user_id IS NOT NULL
  LIMIT 1;

  IF v_hrt_user_id IS NOT NULL THEN
    INSERT INTO notification_logs (
      school_id, recipient_user_id, trigger_event, channel,
      title, body, is_safeguarding, related_student_id
    ) VALUES (
      v_school_id, v_hrt_user_id, 'threshold_alert', 'in_app',
      v_notif_title, v_notif_body, false, NEW.student_id
    );
  END IF;

  -- Notify admins
  SELECT ARRAY_AGG(DISTINCT s.auth_user_id)
  INTO   v_admin_ids
  FROM   staff_roles sr
  JOIN   staff s ON s.id = sr.staff_id
  WHERE  sr.school_id = v_school_id
    AND  sr.role IN ('admin', 'principal')
    AND  s.auth_user_id IS NOT NULL;

  IF v_admin_ids IS NOT NULL THEN
    INSERT INTO notification_logs (
      school_id, recipient_user_id, trigger_event, channel,
      title, body, is_safeguarding, related_student_id
    )
    SELECT
      v_school_id, uid, 'threshold_alert', 'in_app',
      v_notif_title, v_notif_body, false, NEW.student_id
    FROM UNNEST(v_admin_ids) AS uid
    WHERE uid <> v_hrt_user_id OR v_hrt_user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger (fire after every insert/update on attendance_records)
DROP TRIGGER IF EXISTS trg_attendance_threshold ON attendance_records;
CREATE TRIGGER trg_attendance_threshold
  AFTER INSERT OR UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION check_attendance_threshold();

-- ── Demo seed: link demo students to demo parent ───────────────
-- This safely no-ops if demo data isn't present.
DO $$
DECLARE
  v_school_id UUID;
  v_parent_id UUID;
BEGIN
  SELECT id INTO v_school_id FROM schools WHERE code = 'CIS_DEMO' LIMIT 1;
  SELECT id INTO v_parent_id FROM parents WHERE school_id = v_school_id LIMIT 1;

  IF v_school_id IS NOT NULL AND v_parent_id IS NOT NULL THEN
    INSERT INTO student_parent_links (school_id, student_id, parent_id)
    SELECT v_school_id, id, v_parent_id
    FROM   students
    WHERE  school_id = v_school_id
      AND  status    = 'active'
    ON CONFLICT (student_id, parent_id) DO NOTHING;
  END IF;
END $$;
