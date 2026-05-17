-- ============================================================
-- 008_attendance.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS attendance_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id),
  semester_id     UUID NOT NULL REFERENCES semesters(id),
  date            DATE NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('present','absent','late','ap','sick')),
  submitted_by    UUID NOT NULL REFERENCES staff(id),
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  register_locked BOOLEAN NOT NULL DEFAULT false,
  corrected_by    UUID REFERENCES staff(id),
  correction_note TEXT,
  corrected_at    TIMESTAMPTZ,
  UNIQUE (student_id, date)
);

CREATE TABLE IF NOT EXISTS excused_absence_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  attendance_record_id UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE UNIQUE,
  reason_text          TEXT NOT NULL,
  granted_by           UUID NOT NULL REFERENCES staff(id),
  granted_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Attendance summary function ───────────────────────────────
CREATE OR REPLACE FUNCTION get_attendance_summary(
  p_student_id  UUID,
  p_semester_id UUID
) RETURNS TABLE (
  present_count INTEGER,
  absent_count  INTEGER,
  late_count    INTEGER,
  ap_count      INTEGER,
  sick_count    INTEGER,
  total_days    INTEGER,
  percentage    DECIMAL(5,2)
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_school_id       UUID;
  v_start           DATE;
  v_end             DATE;
  v_enrollment_date DATE;
BEGIN
  SELECT school_id INTO v_school_id FROM students WHERE id = p_student_id;
  SELECT COALESCE(syr.effective_start_date, s.start_date), s.end_date
  INTO   v_start, v_end
  FROM   semesters s
  LEFT JOIN student_year_records syr
    ON syr.semester_id = s.id AND syr.student_id = p_student_id
  WHERE  s.id = p_semester_id;

  RETURN QUERY
  WITH counts AS (
    SELECT
      COUNT(*) FILTER (WHERE status='present')  AS p,
      COUNT(*) FILTER (WHERE status='absent')   AS a,
      COUNT(*) FILTER (WHERE status='late')     AS l,
      COUNT(*) FILTER (WHERE status='ap')       AS ap,
      COUNT(*) FILTER (WHERE status='sick')     AS s
    FROM attendance_records
    WHERE student_id = p_student_id AND semester_id = p_semester_id
  ),
  school_days AS (
    SELECT COUNT(*) AS total
    FROM generate_series(v_start, v_end, INTERVAL '1 day') AS d
    WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
      AND NOT EXISTS (
        SELECT 1 FROM calendar_events ce
        WHERE ce.school_id = v_school_id
          AND ce.event_type = 'holiday'
          AND d BETWEEN ce.start_date AND ce.end_date
      )
  )
  SELECT
    counts.p::INTEGER,
    counts.a::INTEGER,
    counts.l::INTEGER,
    counts.ap::INTEGER,
    counts.s::INTEGER,
    school_days.total::INTEGER,
    CASE WHEN school_days.total > 0
      THEN ROUND(((counts.p + counts.l + counts.ap)::DECIMAL / school_days.total) * 100, 2)
      ELSE 0
    END
  FROM counts, school_days;
END;
$$;

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE attendance_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE excused_absence_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "si_attendance" ON attendance_records;
CREATE POLICY "si_attendance" ON attendance_records FOR ALL TO authenticated
  USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
DROP POLICY IF EXISTS "si_excused" ON excused_absence_requests;
CREATE POLICY "si_excused" ON excused_absence_requests FOR ALL TO authenticated
  USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_att_student   ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_att_stream    ON attendance_records(stream_id);
CREATE INDEX IF NOT EXISTS idx_att_semester  ON attendance_records(semester_id);
CREATE INDEX IF NOT EXISTS idx_att_date      ON attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_att_school    ON attendance_records(school_id);
