-- ============================================================
-- 048_student_dashboard_rpc_v2.sql
-- Expand get_student_dashboard to return everything the student
-- home screen needs: profile, attendance, marks, report,
-- day book, invoices. Reduces 7 queries → 1 RPC.
-- ============================================================

CREATE OR REPLACE FUNCTION get_student_dashboard(
  p_student_id UUID,
  p_school_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_semester_id UUID;
  v_semester JSONB;
  v_profile JSONB;
  v_attendance JSONB;
  v_att_records JSONB;
  v_marks JSONB;
  v_report JSONB;
  v_day_book JSONB;
  v_invoices JSONB;
  v_total_outstanding NUMERIC;
BEGIN
  -- Active semester
  SELECT id INTO v_semester_id
    FROM semesters
    WHERE school_id = p_school_id AND is_active = true
    LIMIT 1;

  IF v_semester_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_active_semester');
  END IF;

  SELECT to_jsonb(s) INTO v_semester
    FROM (
      SELECT id, name, start_date, end_date
        FROM semesters WHERE id = v_semester_id
    ) s;

  -- Student profile with stream/grade info
  SELECT to_jsonb(p) INTO v_profile
    FROM (
      SELECT st.id, st.full_name, st.photo_url, st.student_number,
             st.stream_id, st.status,
             jsonb_build_object('name', str.name) AS streams,
             jsonb_build_object('name', g.name) AS grades,
             jsonb_build_object('name', sec.name) AS school_sections
        FROM students st
        LEFT JOIN streams str ON str.id = st.stream_id
        LEFT JOIN grades g ON g.id = str.grade_id
        LEFT JOIN school_sections sec ON sec.id = g.section_id
        WHERE st.id = p_student_id
          AND st.school_id = p_school_id
    ) p;

  -- Attendance records (last 30 days) + summary
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('date', ar.date, 'status', ar.status)
    ORDER BY ar.date DESC
  ), '[]'::jsonb)
  INTO v_att_records
  FROM attendance_records ar
  WHERE ar.school_id = p_school_id
    AND ar.student_id = p_student_id
    AND ar.semester_id = v_semester_id
  ORDER BY ar.date DESC
  LIMIT 30;

  -- Compute attendance rate
  SELECT jsonb_build_object(
    'records',  v_att_records,
    'rate',     CASE WHEN COUNT(*) > 0
                  THEN ROUND((COUNT(*) FILTER (WHERE status = 'present')::numeric / COUNT(*)) * 100)
                  ELSE 0
                END,
    'count',    COUNT(*)
  )
  INTO v_attendance
  FROM attendance_records
  WHERE school_id = p_school_id
    AND student_id = p_student_id
    AND semester_id = v_semester_id;

  -- Marks for this semester
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'assessment_type', m.assessment_type,
      'value', m.value,
      'subjects', jsonb_build_object('name', sub.name)
    )
    ORDER BY m.created_at DESC
  ), '[]'::jsonb)
  INTO v_marks
  FROM marks m
  LEFT JOIN subjects sub ON sub.id = m.subject_id
  WHERE m.school_id = p_school_id
    AND m.student_id = p_student_id
    AND m.semester_id = v_semester_id;

  -- Latest report
  SELECT to_jsonb(r) INTO v_report
    FROM (
      SELECT id, status, overall_percentage, class_position, pdf_url, released_at
        FROM reports
        WHERE school_id = p_school_id
          AND student_id = p_student_id
          AND semester_id = v_semester_id
        ORDER BY created_at DESC
        LIMIT 1
    ) r;

  -- Recent day book entries
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', db.id, 'date', db.date, 'category', db.category, 'description', db.description)
    ORDER BY db.date DESC
  ), '[]'::jsonb)
  INTO v_day_book
  FROM day_book_entries db
  WHERE db.student_id = p_student_id
    AND db.school_id = p_school_id
    AND db.archived = false
  ORDER BY db.date DESC
  LIMIT 3;

  -- Invoices for this semester
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', inv.id,
      'invoice_number', inv.invoice_number,
      'total_amount', inv.total_amount,
      'balance', inv.balance,
      'status', inv.status,
      'due_date', inv.due_date
    )
    ORDER BY inv.created_at DESC
  ), '[]'::jsonb)
  INTO v_invoices
  FROM invoices inv
  WHERE inv.school_id = p_school_id
    AND inv.student_id = p_student_id
    AND inv.semester_id = v_semester_id;

  -- Total outstanding
  SELECT COALESCE(SUM(inv.balance), 0) INTO v_total_outstanding
  FROM invoices inv
  WHERE inv.school_id = p_school_id
    AND inv.student_id = p_student_id
    AND inv.semester_id = v_semester_id
    AND inv.status NOT IN ('paid', 'cancelled');

  RETURN jsonb_build_object(
    'profile',          v_profile,
    'semester',         v_semester,
    'attendance',       v_attendance,
    'marks',            v_marks,
    'latestReport',     v_report,
    'dayBook',          v_day_book,
    'invoices',         v_invoices,
    'totalOutstanding',  v_total_outstanding
  );
END;
$$;
