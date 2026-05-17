-- ============================================================
-- 085_reports_finalization.sql
-- Closes gaps before exam/report season:
--   1. reports.pdf_status / pdf_error / pdf_attempts / pdf_generated_at
--   2. report_subject_remarks   (per-subject teacher remarks)
--   3. assessment_template_streams (stream-specific weight overrides)
--   4. calculate_student_total rewritten to honour stream overrides
--   5. recompute_report_overall(report_id)        RPC
--   6. recompute_stream_positions(stream,semester) RPC
--   7. initialize_reports_for_semester(...)        RPC
--   8. user_has_role / current_staff_id helpers
--   9. Tightened RLS on marks, reports, character_records
-- ============================================================

-- ── 1. PDF status tracking ────────────────────────────────────
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS pdf_status       TEXT NOT NULL DEFAULT 'none'
    CHECK (pdf_status IN ('none','queued','generating','success','failed')),
  ADD COLUMN IF NOT EXISTS pdf_error        TEXT,
  ADD COLUMN IF NOT EXISTS pdf_attempts     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reports_pdf_status ON reports(pdf_status);

-- ── 2. Per-subject teacher remarks ────────────────────────────
CREATE TABLE IF NOT EXISTS report_subject_remarks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  report_id   UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES subjects(id),
  remark      TEXT NOT NULL CHECK (char_length(remark) <= 400),
  entered_by  UUID REFERENCES staff(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, subject_id)
);

ALTER TABLE report_subject_remarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "si_rsr" ON report_subject_remarks;
CREATE POLICY "si_rsr" ON report_subject_remarks FOR ALL TO authenticated
  USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_rsr_report  ON report_subject_remarks(report_id);
CREATE INDEX IF NOT EXISTS idx_rsr_subject ON report_subject_remarks(subject_id);

-- ── 3. Stream-specific weight override junction ───────────────
-- Per-stream override of weight_percent for a given assessment template.
-- If no row for a (template, stream): use template.weight_percent.
CREATE TABLE IF NOT EXISTS assessment_template_streams (
  assessment_template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  stream_id              UUID NOT NULL REFERENCES streams(id)              ON DELETE CASCADE,
  weight_override        DECIMAL(5,2) NOT NULL CHECK (weight_override >= 0 AND weight_override <= 100),
  PRIMARY KEY (assessment_template_id, stream_id)
);

ALTER TABLE assessment_template_streams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "si_ats" ON assessment_template_streams;
CREATE POLICY "si_ats" ON assessment_template_streams FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assessment_templates at
      WHERE at.id = assessment_template_id
        AND at.school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    )
  );

CREATE INDEX IF NOT EXISTS idx_ats_template ON assessment_template_streams(assessment_template_id);
CREATE INDEX IF NOT EXISTS idx_ats_stream   ON assessment_template_streams(stream_id);

-- ── 4. calculate_student_total honours stream overrides ───────
CREATE OR REPLACE FUNCTION calculate_student_total(
  p_student_id  UUID,
  p_semester_id UUID,
  p_subject_id  UUID
) RETURNS TABLE (
  raw_total     DECIMAL,
  rounded_total INTEGER,
  grade_label   TEXT
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_school_id    UUID;
  v_grade_id     UUID;
  v_stream_id    UUID;
  v_raw          DECIMAL := 0;
  v_total_weight DECIMAL := 0;
  v_has_any      BOOLEAN := false;
  v_all_present  BOOLEAN := true;
  rec            RECORD;
  v_mark_val     DECIMAL;
  v_weight       DECIMAL;
BEGIN
  SELECT school_id, grade_id, stream_id
  INTO   v_school_id, v_grade_id, v_stream_id
  FROM   students WHERE id = p_student_id;

  FOR rec IN
    SELECT at.id, at.code, at.weight_percent
    FROM   assessment_templates at
    WHERE  at.school_id  = v_school_id
      AND  at.is_active  = true
      AND  at.code IS NOT NULL
      AND  at.code      != 'biweekly'
      AND (
        NOT EXISTS (SELECT 1 FROM assessment_template_grades atg WHERE atg.assessment_template_id = at.id)
        OR  EXISTS (SELECT 1 FROM assessment_template_grades atg WHERE atg.assessment_template_id = at.id AND atg.grade_id = v_grade_id)
      )
    ORDER BY at.order_index
  LOOP
    SELECT COALESCE(
      (SELECT weight_override FROM assessment_template_streams
        WHERE assessment_template_id = rec.id AND stream_id = v_stream_id),
      rec.weight_percent
    ) INTO v_weight;

    SELECT value INTO v_mark_val
    FROM   marks
    WHERE  student_id    = p_student_id
      AND  semester_id   = p_semester_id
      AND  subject_id    = p_subject_id
      AND  assessment_type = rec.code
      AND  NOT is_excused;

    IF v_mark_val IS NULL THEN
      v_all_present := false;
    ELSE
      v_raw          := v_raw + (v_mark_val * v_weight / 100.0);
      v_total_weight := v_total_weight + v_weight;
      v_has_any      := true;
    END IF;
  END LOOP;

  IF NOT v_has_any OR NOT v_all_present THEN
    v_raw := NULL;
  END IF;

  RETURN QUERY SELECT
    v_raw,
    CASE WHEN v_raw IS NOT NULL THEN ROUND(v_raw)::INTEGER ELSE NULL END,
    CASE WHEN v_raw IS NOT NULL THEN get_grade_label(v_school_id, ROUND(v_raw)) ELSE NULL END;
END;
$$;

-- ── 5. recompute_report_overall(report_id) ────────────────────
-- Averages every subject the student is enrolled in for that semester.
-- Subjects with NULL total (incomplete marks) are skipped. Updates
-- reports.overall_percentage.
CREATE OR REPLACE FUNCTION recompute_report_overall(p_report_id UUID)
RETURNS DECIMAL LANGUAGE plpgsql AS $$
DECLARE
  v_student_id  UUID;
  v_semester_id UUID;
  v_school_id   UUID;
  v_stream_id   UUID;
  v_avg         DECIMAL;
  v_count       INTEGER;
  v_sum         DECIMAL := 0;
  rec           RECORD;
  v_total       DECIMAL;
BEGIN
  SELECT student_id, semester_id, school_id
  INTO   v_student_id, v_semester_id, v_school_id
  FROM   reports WHERE id = p_report_id;
  IF v_student_id IS NULL THEN RETURN NULL; END IF;

  SELECT stream_id INTO v_stream_id FROM students WHERE id = v_student_id;

  v_count := 0;
  -- Use subject_enrollments if rows exist, else fall back to subject_teacher_assignments for the stream
  FOR rec IN
    SELECT DISTINCT subject_id FROM subject_enrollments
    WHERE student_id = v_student_id AND semester_id = v_semester_id
    UNION
    SELECT DISTINCT subject_id FROM subject_teacher_assignments
    WHERE stream_id = v_stream_id AND semester_id = v_semester_id AND school_id = v_school_id
      AND NOT EXISTS (
        SELECT 1 FROM subject_enrollments
        WHERE student_id = v_student_id AND semester_id = v_semester_id
      )
  LOOP
    SELECT raw_total INTO v_total
    FROM calculate_student_total(v_student_id, v_semester_id, rec.subject_id);
    IF v_total IS NOT NULL THEN
      v_sum := v_sum + v_total;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    v_avg := NULL;
  ELSE
    v_avg := ROUND((v_sum / v_count)::numeric, 2);
  END IF;

  UPDATE reports SET overall_percentage = v_avg, updated_at = now()
  WHERE id = p_report_id;

  RETURN v_avg;
END;
$$;

-- ── 6. recompute_stream_positions(stream_id, semester_id) ─────
-- Ranks every report in stream+semester by overall_percentage DESC.
-- Ties broken by student_number ASC. Writes class_position.
CREATE OR REPLACE FUNCTION recompute_stream_positions(
  p_stream_id   UUID,
  p_semester_id UUID
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH ranked AS (
    SELECT r.id,
           RANK() OVER (
             ORDER BY r.overall_percentage DESC NULLS LAST,
                      s.student_number ASC
           ) AS pos
    FROM   reports r
    JOIN   students s ON s.id = r.student_id
    WHERE  s.stream_id   = p_stream_id
      AND  r.semester_id = p_semester_id
      AND  r.overall_percentage IS NOT NULL
  )
  UPDATE reports r
  SET    class_position = ranked.pos,
         updated_at = now()
  FROM   ranked
  WHERE  r.id = ranked.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Convenience: recompute one report's overall and its stream's positions
CREATE OR REPLACE FUNCTION recompute_report_and_rank(p_report_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_stream_id   UUID;
  v_semester_id UUID;
BEGIN
  PERFORM recompute_report_overall(p_report_id);
  SELECT s.stream_id, r.semester_id
  INTO   v_stream_id, v_semester_id
  FROM   reports r
  JOIN   students s ON s.id = r.student_id
  WHERE  r.id = p_report_id;
  IF v_stream_id IS NOT NULL AND v_semester_id IS NOT NULL THEN
    PERFORM recompute_stream_positions(v_stream_id, v_semester_id);
  END IF;
END;
$$;

-- ── 7. initialize_reports_for_semester ────────────────────────
-- Creates draft reports for every active student in the school
-- (optionally narrowed to a stream) for the given semester.
-- Idempotent: ON CONFLICT DO NOTHING.
CREATE OR REPLACE FUNCTION initialize_reports_for_semester(
  p_school_id   UUID,
  p_semester_id UUID,
  p_stream_id   UUID DEFAULT NULL
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  INSERT INTO reports (school_id, student_id, semester_id, status)
  SELECT s.school_id, s.id, p_semester_id, 'draft'
  FROM   students s
  WHERE  s.school_id = p_school_id
    AND  s.status    = 'active'
    AND  (p_stream_id IS NULL OR s.stream_id = p_stream_id)
  ON CONFLICT (student_id, semester_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- ── 8. Role helpers ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION current_school_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt()->'app_metadata'->>'school_id')::uuid;
$$;

CREATE OR REPLACE FUNCTION current_staff_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT id FROM staff
   WHERE auth_user_id = auth.uid()
     AND school_id = current_school_id()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION current_user_roles() RETURNS TEXT[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    array_agg(DISTINCT sr.role),
    ARRAY[]::TEXT[]
  )
  FROM staff_roles sr
  WHERE sr.staff_id = current_staff_id();
$$;

CREATE OR REPLACE FUNCTION user_has_role(p_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_roles sr
    WHERE sr.staff_id = current_staff_id()
      AND sr.role = ANY(p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION current_parent_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT id FROM parents
   WHERE auth_user_id = auth.uid()
     AND school_id = current_school_id()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION current_student_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT id FROM students
   WHERE auth_user_id = auth.uid()
     AND school_id    = current_school_id()
   LIMIT 1;
$$;

-- ── 9. Tightened RLS ──────────────────────────────────────────
-- Marks: staff (any role) in the same school + the student themself + linked parents (released only)
DROP POLICY IF EXISTS "si_marks" ON marks;
CREATE POLICY "marks_select" ON marks FOR SELECT TO authenticated
  USING (
    school_id = current_school_id()
    AND (
      user_has_role(ARRAY['super_admin','admin','principal','coordinator','hod','hrt','st','front_desk','finance'])
      OR student_id = current_student_id()
      OR EXISTS (
        SELECT 1 FROM student_parent_links spl
        WHERE spl.student_id = marks.student_id
          AND spl.parent_id  = current_parent_id()
      )
    )
  );

CREATE POLICY "marks_write" ON marks FOR INSERT TO authenticated
  WITH CHECK (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin','principal','coordinator','hod','hrt','st'])
  );

CREATE POLICY "marks_update" ON marks FOR UPDATE TO authenticated
  USING (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin','principal','coordinator','hod','hrt','st'])
  );

CREATE POLICY "marks_delete" ON marks FOR DELETE TO authenticated
  USING (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin','principal'])
  );

-- Reports: read for staff, student-self, linked parents (released only).
-- Write for admin/principal/hrt only.
DROP POLICY IF EXISTS "si_reports" ON reports;
CREATE POLICY "reports_select" ON reports FOR SELECT TO authenticated
  USING (
    school_id = current_school_id()
    AND (
      user_has_role(ARRAY['super_admin','admin','principal','coordinator','hod','hrt','st','front_desk','finance'])
      OR student_id = current_student_id()
      OR (
        status = 'released' AND EXISTS (
          SELECT 1 FROM student_parent_links spl
          WHERE spl.student_id = reports.student_id
            AND spl.parent_id  = current_parent_id()
        )
      )
    )
  );

CREATE POLICY "reports_insert" ON reports FOR INSERT TO authenticated
  WITH CHECK (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin','principal','hrt'])
  );

CREATE POLICY "reports_update" ON reports FOR UPDATE TO authenticated
  USING (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin','principal','hrt','finance'])
  );

CREATE POLICY "reports_delete" ON reports FOR DELETE TO authenticated
  USING (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin'])
  );

-- Character records: staff (any) + student-self + linked parent (released report only).
-- Write: hrt + admin/principal.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'character_records') THEN
    EXECUTE 'DROP POLICY IF EXISTS "si_character_records" ON character_records';
    EXECUTE $POL$
      CREATE POLICY "char_select" ON character_records FOR SELECT TO authenticated
        USING (
          school_id = current_school_id()
          AND (
            user_has_role(ARRAY['super_admin','admin','principal','coordinator','hod','hrt','st'])
            OR student_id = current_student_id()
            OR EXISTS (
              SELECT 1 FROM student_parent_links spl
              WHERE spl.student_id = character_records.student_id
                AND spl.parent_id  = current_parent_id()
            )
          )
        )
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "char_write" ON character_records FOR INSERT TO authenticated
        WITH CHECK (
          school_id = current_school_id()
          AND user_has_role(ARRAY['super_admin','admin','principal','hrt'])
        )
    $POL$;
    EXECUTE $POL$
      CREATE POLICY "char_update" ON character_records FOR UPDATE TO authenticated
        USING (
          school_id = current_school_id()
          AND user_has_role(ARRAY['super_admin','admin','principal','hrt'])
        )
    $POL$;
  END IF;
END $$;

-- Subject remarks: staff write, student/parent read released-only
DROP POLICY IF EXISTS "si_rsr" ON report_subject_remarks;
CREATE POLICY "rsr_select" ON report_subject_remarks FOR SELECT TO authenticated
  USING (
    school_id = current_school_id()
    AND (
      user_has_role(ARRAY['super_admin','admin','principal','coordinator','hod','hrt','st'])
      OR EXISTS (
        SELECT 1 FROM reports r
        WHERE r.id = report_id
          AND (
            r.student_id = current_student_id()
            OR (r.status = 'released' AND EXISTS (
              SELECT 1 FROM student_parent_links spl
              WHERE spl.student_id = r.student_id
                AND spl.parent_id  = current_parent_id()
            ))
          )
      )
    )
  );

CREATE POLICY "rsr_write" ON report_subject_remarks FOR INSERT TO authenticated
  WITH CHECK (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin','principal','hrt','st'])
  );

CREATE POLICY "rsr_update" ON report_subject_remarks FOR UPDATE TO authenticated
  USING (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin','principal','hrt','st'])
  );

CREATE POLICY "rsr_delete" ON report_subject_remarks FOR DELETE TO authenticated
  USING (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin','principal','hrt'])
  );
