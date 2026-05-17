-- ============================================================
-- 017_search_functions.sql — Global search RPC
-- ============================================================

CREATE OR REPLACE FUNCTION search_students(
  p_query     TEXT,
  p_limit     INTEGER DEFAULT 20
)
RETURNS TABLE (
  id             UUID,
  full_name      TEXT,
  student_number TEXT,
  grade_name     TEXT,
  stream_name    TEXT,
  section_name   TEXT,
  photo_url      TEXT,
  status         TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    s.id,
    s.full_name,
    s.student_number,
    g.name  AS grade_name,
    st.name AS stream_name,
    sc.name AS section_name,
    s.photo_url,
    s.status
  FROM students s
  JOIN grades g ON g.id = s.grade_id
  JOIN streams st ON st.id = s.stream_id
  JOIN school_sections sc ON sc.id = s.section_id
  WHERE s.school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND s.status = 'active'
    AND (
      s.full_name      ILIKE '%' || p_query || '%'
      OR s.student_number ILIKE '%' || p_query || '%'
      OR g.name           ILIKE '%' || p_query || '%'
      OR st.name          ILIKE '%' || p_query || '%'
    )
  ORDER BY
    CASE WHEN s.full_name ILIKE p_query || '%' THEN 0 ELSE 1 END,
    s.full_name
  LIMIT p_limit;
$$;

-- Search staff
CREATE OR REPLACE FUNCTION search_staff(p_query TEXT, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  id           UUID,
  full_name    TEXT,
  staff_number TEXT,
  department   TEXT,
  roles        TEXT[],
  status       TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    s.id, s.full_name, s.staff_number, s.department,
    ARRAY_AGG(sr.role) AS roles,
    s.status
  FROM staff s
  LEFT JOIN staff_roles sr ON sr.staff_id = s.id
  WHERE s.school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (s.full_name ILIKE '%'||p_query||'%' OR s.staff_number ILIKE '%'||p_query||'%')
  GROUP BY s.id
  LIMIT p_limit;
$$;

-- Resolve school by code (used on login screen — no auth required)
CREATE OR REPLACE FUNCTION resolve_school(p_code TEXT)
RETURNS TABLE (
  school_id       UUID,
  name            TEXT,
  logo_url        TEXT,
  primary_color   TEXT,
  secondary_color TEXT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id, name, logo_url, primary_color, secondary_color
  FROM schools WHERE code = p_code AND subscription_status != 'cancelled'
  LIMIT 1;
$$;

-- Marks completion matrix for a semester
CREATE OR REPLACE FUNCTION get_marks_completion(p_semester_id UUID)
RETURNS TABLE (
  subject_id    UUID,
  subject_name  TEXT,
  stream_id     UUID,
  stream_name   TEXT,
  entered       INTEGER,
  total         INTEGER,
  pct_complete  DECIMAL
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    sub.id AS subject_id,
    sub.name AS subject_name,
    str.id AS stream_id,
    str.name AS stream_name,
    COUNT(m.id) FILTER (WHERE m.value IS NOT NULL AND NOT m.is_excused) AS entered,
    COUNT(m.id) AS total,
    CASE WHEN COUNT(m.id) > 0
      THEN ROUND(COUNT(m.id) FILTER (WHERE m.value IS NOT NULL AND NOT m.is_excused)::DECIMAL / COUNT(m.id) * 100, 1)
      ELSE 0
    END AS pct_complete
  FROM marks m
  JOIN subjects sub ON sub.id = m.subject_id
  JOIN streams str ON str.id = m.stream_id
  WHERE m.semester_id = p_semester_id
    AND m.school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND m.assessment_type != 'biweekly'
  GROUP BY sub.id, sub.name, str.id, str.name;
$$;
