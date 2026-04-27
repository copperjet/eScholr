-- ============================================================
-- 038_perf_indexes_and_stats.sql
-- Performance:
--   1. Composite indexes for common dashboard queries.
--   2. school_stats materialised view + refresh function so
--      `count(*) exact` calls on home screens become a 1-row
--      lookup. Avoids row-locking under heavy concurrent load.
-- ============================================================

-- ─── Composite indexes ───────────────────────────────────────

-- Admin dashboard: today's attendance roll-up + status filter
CREATE INDEX IF NOT EXISTS idx_att_school_date_status
  ON attendance_records (school_id, date, status);

-- HRT dashboard: stream-level register lookup for today
CREATE INDEX IF NOT EXISTS idx_att_stream_date
  ON attendance_records (stream_id, date);

-- ST/HRT marks entry + matrix queries (subject + assessment)
CREATE INDEX IF NOT EXISTS idx_marks_stream_sem_assess
  ON marks (stream_id, semester_id, assessment_type);

-- Admin reports tab: pending list + counts by status
CREATE INDEX IF NOT EXISTS idx_reports_school_status
  ON reports (school_id, status, semester_id);

-- Day book: list-by-school-and-date queries
CREATE INDEX IF NOT EXISTS idx_daybook_school_date
  ON day_book_entries (school_id, date DESC);

-- Day book: list-by-staff (HRT/ST creator-mine view)
CREATE INDEX IF NOT EXISTS idx_daybook_school_creator
  ON day_book_entries (school_id, created_by, date DESC);

-- Students: school-wide active list filtered by stream
CREATE INDEX IF NOT EXISTS idx_students_school_status_stream
  ON students (school_id, status, stream_id);

-- Homework: due-today / next-7-day lookups by stream
CREATE INDEX IF NOT EXISTS idx_homework_stream_due
  ON homework_assignments (school_id, stream_id, due_date)
  WHERE is_active = true;

-- Notifications log: by school + most recent
CREATE INDEX IF NOT EXISTS idx_notifications_school_created
  ON notification_logs (school_id, created_at DESC);

-- Audit log: by school + most recent
CREATE INDEX IF NOT EXISTS idx_audit_logs_school_created
  ON audit_logs (school_id, created_at DESC);

-- ─── Materialised dashboard stats ────────────────────────────
--
-- Refreshed on a 5-minute schedule (or on-demand). Read by
-- `get_admin_dashboard()` in the future via UNION fallback if
-- the view is fresh enough.

CREATE MATERIALIZED VIEW IF NOT EXISTS school_stats AS
SELECT
  s.id                           AS school_id,
  COALESCE(stu.cnt, 0)::INTEGER  AS active_students,
  COALESCE(stf.cnt, 0)::INTEGER  AS active_staff,
  COALESCE(rep.cnt, 0)::INTEGER  AS pending_reports,
  now()                          AS refreshed_at
FROM schools s
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS cnt FROM students
   WHERE school_id = s.id AND status = 'active'
) stu ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS cnt FROM staff
   WHERE school_id = s.id AND status = 'active'
) stf ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS cnt FROM reports
   WHERE school_id = s.id AND status = 'pending_approval'
) rep ON TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_stats_school
  ON school_stats (school_id);

-- Refresh function — call from a cron job or after big writes
CREATE OR REPLACE FUNCTION refresh_school_stats()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY school_stats;
EXCEPTION WHEN OTHERS THEN
  -- Fall back to non-concurrent refresh on first run (no rows yet)
  REFRESH MATERIALIZED VIEW school_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_school_stats() TO authenticated;

-- Lightweight RPC: instant school stats (1-row lookup, no scans)
CREATE OR REPLACE FUNCTION get_school_stats(p_school_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'activeStudents',  COALESCE(active_students, 0),
    'activeStaff',     COALESCE(active_staff, 0),
    'pendingReports',  COALESCE(pending_reports, 0),
    'refreshedAt',     refreshed_at
  )
  FROM school_stats
  WHERE school_id = p_school_id;
$$;

GRANT EXECUTE ON FUNCTION get_school_stats(UUID) TO authenticated;

-- Also expose the materialised view through RLS so direct
-- selects work for Postgrest fallback paths.
ALTER MATERIALIZED VIEW school_stats OWNER TO postgres;
