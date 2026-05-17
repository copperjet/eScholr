-- ============================================================
-- 036_dashboard_rpcs.sql
-- Performance: replace 5-query waterfalls on every dashboard
-- with a single SQL call. Each function returns a JSONB payload.
-- Functions run as SECURITY INVOKER so RLS on each table still
-- enforces tenancy. Caller must already be authenticated.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Admin / Principal / Coordinator / HOD dashboard
-- Replaces 5 parallel queries on home.tsx.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_admin_dashboard(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_student_count INTEGER;
  v_staff_count INTEGER;
  v_pending_reports INTEGER;
  v_present_today INTEGER;
  v_total_att_today INTEGER;
  v_semester JSONB;
BEGIN
  SELECT COUNT(*) INTO v_student_count
    FROM students WHERE school_id = p_school_id AND status = 'active';

  SELECT COUNT(*) INTO v_staff_count
    FROM staff WHERE school_id = p_school_id AND status = 'active';

  SELECT COUNT(*) INTO v_pending_reports
    FROM reports WHERE school_id = p_school_id AND status = 'pending_approval';

  SELECT
    COUNT(*) FILTER (WHERE status = 'present'),
    COUNT(*)
    INTO v_present_today, v_total_att_today
    FROM attendance_records
    WHERE school_id = p_school_id AND date = v_today;

  SELECT to_jsonb(s) INTO v_semester
    FROM (
      SELECT id, name, start_date, end_date, is_active
        FROM semesters
        WHERE school_id = p_school_id AND is_active = true
        LIMIT 1
    ) s;

  RETURN jsonb_build_object(
    'studentCount',    v_student_count,
    'staffCount',      v_staff_count,
    'pendingReports',  v_pending_reports,
    'presentToday',    v_present_today,
    'totalAttToday',   v_total_att_today,
    'semester',        v_semester
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_dashboard(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- HRT (Home Room Teacher) dashboard
-- Replaces the 5-query waterfall in (hrt)/home.tsx.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_hrt_dashboard(
  p_staff_id UUID,
  p_school_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_assignment RECORD;
  v_assignment_json JSONB;
  v_attendance JSONB;
  v_marks_entered INTEGER;
  v_total_students INTEGER;
  v_first_subject TEXT;
  v_day_book JSONB;
BEGIN
  -- Find HRT assignment (primary OR co-HRT)
  SELECT a.stream_id, a.semester_id, st.name AS stream_name,
         g.name AS grade_name, sec.name AS section_name,
         sm.name AS semester_name, sm.end_date AS semester_end
    INTO v_assignment
    FROM hrt_assignments a
    JOIN streams st ON st.id = a.stream_id
    JOIN grades g ON g.id = st.grade_id
    JOIN school_sections sec ON sec.id = g.section_id
    JOIN semesters sm ON sm.id = a.semester_id
    WHERE a.school_id = p_school_id
      AND (a.staff_id = p_staff_id OR a.co_hrt_staff_id = p_staff_id)
    LIMIT 1;

  IF v_assignment IS NULL THEN
    RETURN jsonb_build_object('assignment', NULL);
  END IF;

  v_assignment_json := jsonb_build_object(
    'streamId',     v_assignment.stream_id,
    'semesterId',   v_assignment.semester_id,
    'streamName',   v_assignment.stream_name,
    'gradeName',    v_assignment.grade_name,
    'sectionName',  v_assignment.section_name,
    'semesterName', v_assignment.semester_name,
    'semesterEnd',  v_assignment.semester_end
  );

  -- Today's attendance for this stream
  SELECT jsonb_build_object(
    'presentCount',      COUNT(*) FILTER (WHERE status = 'present'),
    'absentCount',       COUNT(*) FILTER (WHERE status = 'absent'),
    'lateCount',         COUNT(*) FILTER (WHERE status = 'late'),
    'totalMarked',       COUNT(*),
    'registerSubmitted', COUNT(*) > 0
  )
  INTO v_attendance
  FROM attendance_records
  WHERE school_id = p_school_id
    AND stream_id = v_assignment.stream_id
    AND date = v_today;

  -- Marks entered (FA1) for this stream/semester
  SELECT COUNT(*) INTO v_marks_entered
    FROM marks
    WHERE school_id = p_school_id
      AND stream_id = v_assignment.stream_id
      AND semester_id = v_assignment.semester_id
      AND assessment_type = 'fa1';

  -- Total active students in this stream
  SELECT COUNT(*) INTO v_total_students
    FROM students
    WHERE school_id = p_school_id
      AND stream_id = v_assignment.stream_id
      AND status = 'active';

  -- First subject taught here (for the marks card label)
  SELECT s.name INTO v_first_subject
    FROM subject_teacher_assignments sta
    JOIN subjects s ON s.id = sta.subject_id
    WHERE sta.school_id = p_school_id
      AND sta.stream_id = v_assignment.stream_id
    LIMIT 1;

  -- Recent day-book entries created by this HRT
  SELECT COALESCE(jsonb_agg(d ORDER BY d.created_at DESC), '[]'::jsonb)
    INTO v_day_book
    FROM (
      SELECT db.id, db.student_id, db.category,
             db.description AS note,
             db.date,
             db.created_at,
             jsonb_build_object(
               'fullName',  s.full_name,
               'photoUrl',  s.photo_url
             ) AS student
        FROM day_book_entries db
        JOIN students s ON s.id = db.student_id
        WHERE db.school_id = p_school_id
          AND db.created_by = p_staff_id
          AND db.archived = false
        ORDER BY db.created_at DESC
        LIMIT 3
    ) d;

  RETURN jsonb_build_object(
    'assignment',       v_assignment_json,
    'attendance',       v_attendance,
    'marksEntered',     v_marks_entered,
    'totalStudents',    v_total_students,
    'firstSubjectName', COALESCE(v_first_subject, 'FA1'),
    'dayBook',          v_day_book
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_hrt_dashboard(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- Student dashboard
-- Replaces multi-query student/home.tsx fetches.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_student_dashboard(
  p_student_id UUID,
  p_school_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_semester_id UUID;
  v_attendance JSONB;
  v_report JSONB;
  v_today_homework JSONB;
BEGIN
  SELECT id INTO v_semester_id
    FROM semesters
    WHERE school_id = p_school_id AND is_active = true
    LIMIT 1;

  -- Attendance summary for active semester
  SELECT jsonb_build_object(
    'present',    COUNT(*) FILTER (WHERE status = 'present'),
    'absent',     COUNT(*) FILTER (WHERE status = 'absent'),
    'late',       COUNT(*) FILTER (WHERE status = 'late'),
    'totalDays',  COUNT(*)
  )
  INTO v_attendance
  FROM attendance_records
  WHERE school_id = p_school_id
    AND student_id = p_student_id
    AND semester_id = v_semester_id;

  -- Latest report card (released)
  SELECT to_jsonb(r) INTO v_report
    FROM (
      SELECT id, status, overall_percentage, released_at, pdf_url
        FROM reports
        WHERE school_id = p_school_id
          AND student_id = p_student_id
          AND semester_id = v_semester_id
        LIMIT 1
    ) r;

  -- Homework due in next 7 days for this student's stream
  -- Wrapped in EXCEPTION so the RPC works even if homework module is not deployed.
  BEGIN
    SELECT COALESCE(jsonb_agg(h ORDER BY h.due_date ASC), '[]'::jsonb)
      INTO v_today_homework
      FROM (
        SELECT hw.id, hw.title, hw.due_date, hw.subject_id,
               sub.name AS subject_name
          FROM homework_assignments hw
          JOIN students s ON s.stream_id = hw.stream_id
          JOIN subjects sub ON sub.id = hw.subject_id
          WHERE hw.school_id = p_school_id
            AND s.id = p_student_id
            AND hw.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
            AND hw.is_active = true
          ORDER BY hw.due_date ASC
          LIMIT 5
      ) h;
  EXCEPTION WHEN undefined_table THEN
    v_today_homework := '[]'::jsonb;
  END;

  RETURN jsonb_build_object(
    'semesterId',     v_semester_id,
    'attendance',     v_attendance,
    'report',         v_report,
    'upcomingHomework', v_today_homework
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_student_dashboard(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- Parent dashboard (single child view)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_parent_child_dashboard(
  p_child_id UUID,
  p_school_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_semester_id UUID;
  v_attendance JSONB;
  v_report JSONB;
  v_day_book JSONB;
BEGIN
  SELECT id INTO v_semester_id
    FROM semesters
    WHERE school_id = p_school_id AND is_active = true
    LIMIT 1;

  -- Attendance summary
  SELECT jsonb_build_object(
    'present',    COUNT(*) FILTER (WHERE status = 'present'),
    'absent',     COUNT(*) FILTER (WHERE status = 'absent'),
    'late',       COUNT(*) FILTER (WHERE status = 'late'),
    'totalDays',  COUNT(*)
  )
  INTO v_attendance
  FROM attendance_records
  WHERE school_id = p_school_id
    AND student_id = p_child_id
    AND semester_id = v_semester_id;

  -- Released report
  SELECT to_jsonb(r) INTO v_report
    FROM (
      SELECT id, status, overall_percentage, released_at, pdf_url
        FROM reports
        WHERE school_id = p_school_id
          AND student_id = p_child_id
          AND semester_id = v_semester_id
        LIMIT 1
    ) r;

  -- Recent day-book entries shared with parent
  SELECT COALESCE(jsonb_agg(d ORDER BY d.created_at DESC), '[]'::jsonb)
    INTO v_day_book
    FROM (
      SELECT db.id, db.category,
             db.description AS note,
             db.date,
             db.created_at,
             jsonb_build_object('fullName', s.full_name) AS staff
        FROM day_book_entries db
        JOIN staff s ON s.id = db.created_by
        WHERE db.school_id = p_school_id
          AND db.student_id = p_child_id
          AND db.send_to_parent = true
          AND db.archived = false
        ORDER BY db.created_at DESC
        LIMIT 5
    ) d;

  RETURN jsonb_build_object(
    'semesterId',  v_semester_id,
    'attendance',  v_attendance,
    'report',      v_report,
    'dayBook',     v_day_book
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_parent_child_dashboard(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- Finance dashboard
-- Aggregates outstanding fees + payments.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_finance_dashboard(p_school_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_outstanding NUMERIC;
  v_paid_this_month NUMERIC;
  v_overdue_count INTEGER;
  v_total_students INTEGER;
BEGIN
  -- Total outstanding balance across active students.
  SELECT COALESCE(SUM(fr.balance), 0) INTO v_outstanding
    FROM finance_records fr
    WHERE fr.school_id = p_school_id
      AND fr.balance > 0
      AND fr.status = 'unpaid';

  SELECT COALESCE(SUM(pt.amount), 0) INTO v_paid_this_month
    FROM payment_transactions pt
    WHERE pt.school_id = p_school_id
      AND pt.paid_at >= date_trunc('month', CURRENT_DATE);

  SELECT COUNT(*) INTO v_overdue_count
    FROM finance_records fr
    JOIN semesters sm ON sm.id = fr.semester_id
    WHERE fr.school_id = p_school_id
      AND fr.balance > 0
      AND fr.status = 'unpaid'
      AND sm.end_date < CURRENT_DATE;

  SELECT COUNT(*) INTO v_total_students
    FROM students WHERE school_id = p_school_id AND status = 'active';

  RETURN jsonb_build_object(
    'outstandingTotal', v_outstanding,
    'paidThisMonth',    v_paid_this_month,
    'overdueCount',     v_overdue_count,
    'activeStudents',   v_total_students
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_finance_dashboard(UUID) TO authenticated;
