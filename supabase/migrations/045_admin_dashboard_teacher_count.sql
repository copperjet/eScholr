-- Migration 045: Add teacherCount to get_admin_dashboard RPC
-- Teacher count = staff with hrt or st roles

CREATE OR REPLACE FUNCTION get_admin_dashboard(p_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_count int;
  v_staff_count int;
  v_teacher_count int;
  v_pending_reports int;
  v_semester jsonb;
  v_present_today int;
  v_total_att_today int;
BEGIN
  -- Student count
  SELECT COUNT(*) INTO v_student_count
  FROM students
  WHERE school_id = p_school_id AND status = 'active';

  -- Staff count
  SELECT COUNT(*) INTO v_staff_count
  FROM staff
  WHERE school_id = p_school_id AND status = 'active';

  -- Teacher count (staff with hrt or st role)
  SELECT COUNT(DISTINCT s.id) INTO v_teacher_count
  FROM staff s
  JOIN staff_roles sr ON s.id = sr.staff_id
  WHERE s.school_id = p_school_id
    AND s.status = 'active'
    AND sr.role IN ('hrt', 'st');

  -- Pending reports
  SELECT COUNT(*) INTO v_pending_reports
  FROM reports
  WHERE school_id = p_school_id AND status = 'pending_approval';

  -- Active semester
  SELECT jsonb_build_object(
    'id', id,
    'name', name,
    'start_date', start_date,
    'end_date', end_date
  ) INTO v_semester
  FROM semesters
  WHERE school_id = p_school_id AND is_active = true
  LIMIT 1;

  -- Attendance today
  SELECT 
    COUNT(*) FILTER (WHERE status = 'present'),
    COUNT(*)
  INTO v_present_today, v_total_att_today
  FROM attendance_records
  WHERE school_id = p_school_id AND date = CURRENT_DATE;

  RETURN jsonb_build_object(
    'studentCount', v_student_count,
    'staffCount', v_staff_count,
    'teacherCount', v_teacher_count,
    'pendingReports', v_pending_reports,
    'semester', v_semester,
    'presentToday', v_present_today,
    'totalAttToday', v_total_att_today
  );
END;
$$;
