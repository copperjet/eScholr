-- ============================================================
-- 049_st_dashboard_rpc.sql
-- Subject Teacher dashboard — eliminates N+1 queries.
-- Returns all assignments with student counts and marks counts
-- in a single query instead of 2 queries per assignment.
-- ============================================================

CREATE OR REPLACE FUNCTION get_st_dashboard(
  p_staff_id UUID,
  p_school_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_data ORDER BY sub_name, stream_name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      sta.id,
      sta.subject_id,
      sta.stream_id,
      sta.semester_id,
      sub.name AS sub_name,
      sub.department,
      str.name AS stream_name,
      g.name AS grade_name,
      sec.section_type,
      sem.name AS semester_name,
      sem.is_active,
      -- Student count for this stream
      (SELECT COUNT(*)
         FROM students s
        WHERE s.school_id = p_school_id
          AND s.stream_id = sta.stream_id
          AND s.status = 'active'
      ) AS student_count,
      -- Marks entered for this subject/stream/semester
      (SELECT COUNT(*)
         FROM marks m
        WHERE m.school_id = p_school_id
          AND m.subject_id = sta.subject_id
          AND m.stream_id = sta.stream_id
          AND m.semester_id = sta.semester_id
      ) AS marked_count,
      -- Build the nested JSON matching client expectations
      jsonb_build_object(
        'id', sta.id,
        'subject_id', sta.subject_id,
        'stream_id', sta.stream_id,
        'semester_id', sta.semester_id,
        'subjects', jsonb_build_object('name', sub.name, 'department', sub.department),
        'streams', jsonb_build_object(
          'name', str.name,
          'grades', jsonb_build_object(
            'name', g.name,
            'school_sections', jsonb_build_object('section_type', sec.section_type)
          )
        ),
        'semesters', jsonb_build_object('name', sem.name, 'is_active', sem.is_active),
        'studentCount', (SELECT COUNT(*) FROM students s WHERE s.school_id = p_school_id AND s.stream_id = sta.stream_id AND s.status = 'active'),
        'markedCount', (SELECT COUNT(*) FROM marks m WHERE m.school_id = p_school_id AND m.subject_id = sta.subject_id AND m.stream_id = sta.stream_id AND m.semester_id = sta.semester_id),
        'expected', (SELECT COUNT(*) FROM students s WHERE s.school_id = p_school_id AND s.stream_id = sta.stream_id AND s.status = 'active')
          * CASE WHEN sec.section_type = 'igcse' THEN 1 ELSE 3 END
      ) AS row_data
    FROM subject_teacher_assignments sta
    JOIN subjects sub ON sub.id = sta.subject_id
    JOIN streams str ON str.id = sta.stream_id
    JOIN grades g ON g.id = str.grade_id
    JOIN school_sections sec ON sec.id = g.section_id
    JOIN semesters sem ON sem.id = sta.semester_id
    WHERE sta.staff_id = p_staff_id
      AND sta.school_id = p_school_id
      AND sem.is_active = true
  ) sub;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_st_dashboard(UUID, UUID) TO authenticated;
