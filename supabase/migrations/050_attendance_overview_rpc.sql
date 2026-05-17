-- ============================================================
-- 050_attendance_overview_rpc.sql
-- Replaces the 3-query + client-side aggregation pattern in
-- useAttendanceOverview with a single server-side RPC.
-- Eliminates the 2000-student limit and reduces data transfer.
-- ============================================================

CREATE OR REPLACE FUNCTION get_attendance_overview(
  p_school_id UUID,
  p_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN (
    SELECT COALESCE(jsonb_agg(row_data ORDER BY section_name, grade_name, stream_name), '[]'::jsonb)
    FROM (
      SELECT
        str.id AS stream_id,
        str.name AS stream_name,
        g.name AS grade_name,
        sec.name AS section_name,
        -- Student count per stream (no limit!)
        (SELECT COUNT(*)
           FROM students s
          WHERE s.school_id = p_school_id
            AND s.stream_id = str.id
            AND s.status = 'active'
        ) AS total_students,
        -- Attendance aggregates for this date
        (SELECT COUNT(*) FILTER (WHERE ar.status = 'present')
           FROM attendance_records ar
          WHERE ar.school_id = p_school_id
            AND ar.stream_id = str.id
            AND ar.date = p_date
        ) AS present_count,
        (SELECT COUNT(*) FILTER (WHERE ar.status = 'absent')
           FROM attendance_records ar
          WHERE ar.school_id = p_school_id
            AND ar.stream_id = str.id
            AND ar.date = p_date
        ) AS absent_count,
        -- Was register submitted (locked)?
        EXISTS (
          SELECT 1 FROM attendance_records ar
          WHERE ar.school_id = p_school_id
            AND ar.stream_id = str.id
            AND ar.date = p_date
            AND ar.register_locked = true
        ) AS submitted_today,
        -- Who submitted
        (SELECT sf.full_name
           FROM attendance_records ar
           JOIN staff sf ON sf.id = ar.submitted_by
          WHERE ar.school_id = p_school_id
            AND ar.stream_id = str.id
            AND ar.date = p_date
            AND ar.submitted_by IS NOT NULL
          LIMIT 1
        ) AS submitted_by_name,
        -- Build JSONB row
        jsonb_build_object(
          'streamId',       str.id,
          'streamName',     str.name,
          'gradeName',      g.name,
          'sectionName',    sec.name,
          'totalStudents',  (SELECT COUNT(*) FROM students s WHERE s.school_id = p_school_id AND s.stream_id = str.id AND s.status = 'active'),
          'submittedToday', EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.school_id = p_school_id AND ar.stream_id = str.id AND ar.date = p_date AND ar.register_locked = true),
          'presentCount',   (SELECT COUNT(*) FILTER (WHERE ar.status = 'present') FROM attendance_records ar WHERE ar.school_id = p_school_id AND ar.stream_id = str.id AND ar.date = p_date),
          'absentCount',    (SELECT COUNT(*) FILTER (WHERE ar.status = 'absent') FROM attendance_records ar WHERE ar.school_id = p_school_id AND ar.stream_id = str.id AND ar.date = p_date),
          'presentPct',     CASE
                              WHEN (SELECT COUNT(*) FROM students s WHERE s.school_id = p_school_id AND s.stream_id = str.id AND s.status = 'active') > 0
                              THEN ROUND(
                                (SELECT COUNT(*) FILTER (WHERE ar.status = 'present') FROM attendance_records ar WHERE ar.school_id = p_school_id AND ar.stream_id = str.id AND ar.date = p_date)::numeric
                                / (SELECT COUNT(*) FROM students s WHERE s.school_id = p_school_id AND s.stream_id = str.id AND s.status = 'active') * 100
                              )
                              ELSE 0
                            END,
          'submittedByName', (SELECT sf.full_name FROM attendance_records ar JOIN staff sf ON sf.id = ar.submitted_by WHERE ar.school_id = p_school_id AND ar.stream_id = str.id AND ar.date = p_date AND ar.submitted_by IS NOT NULL LIMIT 1)
        ) AS row_data
      FROM streams str
      JOIN grades g ON g.id = str.grade_id
      JOIN school_sections sec ON sec.id = g.section_id
      WHERE str.school_id = p_school_id
    ) sub
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_attendance_overview(UUID, DATE) TO authenticated;
