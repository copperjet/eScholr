-- ============================================================
-- 086_exam_pipeline_polish.sql
-- Closes residual gaps in the exam/report pipeline:
--   1. assessment_templates.max_marks
--   2. schools.requires_finance_clearance
--   3. student_assessment_overrides (per-student weight/exempt)
--   4. report_pdf_jobs queue + cron registration
--   5. Drop legacy student_year_records weight columns
--   6. Biweekly integration: seed template, drop biweekly_records
--   7. calculate_student_total honours max_marks + overrides + exemptions
--   8. grading_scales gap-coverage trigger
--   9. Helper RPC enqueue_report_pdf
-- ============================================================

-- ── 1. max_marks per assessment ───────────────────────────────
ALTER TABLE assessment_templates
  ADD COLUMN IF NOT EXISTS max_marks DECIMAL(6,2) NOT NULL DEFAULT 100
    CHECK (max_marks > 0 AND max_marks <= 1000);

-- ── 2. Finance clearance flag on schools ──────────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS requires_finance_clearance BOOLEAN NOT NULL DEFAULT false;

-- ── 3. Per-student assessment overrides ───────────────────────
CREATE TABLE IF NOT EXISTS student_assessment_overrides (
  school_id              UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id             UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  semester_id            UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  assessment_template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  weight_override        DECIMAL(5,2) CHECK (weight_override IS NULL OR (weight_override >= 0 AND weight_override <= 100)),
  is_exempt              BOOLEAN NOT NULL DEFAULT false,
  reason                 TEXT,
  created_by             UUID REFERENCES staff(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, semester_id, assessment_template_id)
);

ALTER TABLE student_assessment_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sao_select" ON student_assessment_overrides;
CREATE POLICY "sao_select" ON student_assessment_overrides FOR SELECT TO authenticated
  USING (
    school_id = current_school_id()
    AND (
      user_has_role(ARRAY['super_admin','admin','principal','coordinator','hod','hrt','st','finance'])
      OR student_id = current_student_id()
    )
  );

DROP POLICY IF EXISTS "sao_write" ON student_assessment_overrides;
CREATE POLICY "sao_write" ON student_assessment_overrides FOR INSERT TO authenticated
  WITH CHECK (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin','principal','coordinator','hod'])
  );

DROP POLICY IF EXISTS "sao_update" ON student_assessment_overrides;
CREATE POLICY "sao_update" ON student_assessment_overrides FOR UPDATE TO authenticated
  USING (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin','principal','coordinator','hod'])
  );

DROP POLICY IF EXISTS "sao_delete" ON student_assessment_overrides;
CREATE POLICY "sao_delete" ON student_assessment_overrides FOR DELETE TO authenticated
  USING (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin','principal','coordinator','hod'])
  );

CREATE INDEX IF NOT EXISTS idx_sao_student  ON student_assessment_overrides(student_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_sao_template ON student_assessment_overrides(assessment_template_id);

-- ── 4. PDF job queue ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_pdf_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  report_id   UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','success','failed')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  priority    INTEGER NOT NULL DEFAULT 5,
  is_preview  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rpj_one_active
  ON report_pdf_jobs(report_id)
  WHERE status IN ('queued','running');

CREATE INDEX IF NOT EXISTS idx_rpj_status   ON report_pdf_jobs(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_rpj_report   ON report_pdf_jobs(report_id);

ALTER TABLE report_pdf_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rpj_select" ON report_pdf_jobs;
CREATE POLICY "rpj_select" ON report_pdf_jobs FOR SELECT TO authenticated
  USING (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin','principal','coordinator','hod','hrt'])
  );

DROP POLICY IF EXISTS "rpj_insert" ON report_pdf_jobs;
CREATE POLICY "rpj_insert" ON report_pdf_jobs FOR INSERT TO authenticated
  WITH CHECK (
    school_id = current_school_id()
    AND user_has_role(ARRAY['super_admin','admin','principal','hrt'])
  );

-- No client UPDATE/DELETE policy → runner uses service role.

-- Helper RPC clients call to enqueue (avoids needing direct insert grant)
CREATE OR REPLACE FUNCTION enqueue_report_pdf(
  p_report_id UUID,
  p_is_preview BOOLEAN DEFAULT false,
  p_priority   INTEGER DEFAULT 5
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_school_id UUID;
  v_existing  UUID;
  v_new_id    UUID;
BEGIN
  SELECT school_id INTO v_school_id FROM reports WHERE id = p_report_id;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Report % not found', p_report_id;
  END IF;

  -- Reuse existing queued/running row if any (idempotent)
  SELECT id INTO v_existing
  FROM   report_pdf_jobs
  WHERE  report_id = p_report_id
    AND  status IN ('queued','running');

  IF v_existing IS NOT NULL THEN
    UPDATE report_pdf_jobs
       SET priority   = LEAST(priority, p_priority),
           is_preview = p_is_preview
     WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO report_pdf_jobs (school_id, report_id, status, priority, is_preview)
  VALUES (v_school_id, p_report_id, 'queued', p_priority, p_is_preview)
  RETURNING id INTO v_new_id;

  UPDATE reports
     SET pdf_status = 'queued', pdf_error = NULL, updated_at = now()
   WHERE id = p_report_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION enqueue_report_pdf(UUID, BOOLEAN, INTEGER) FROM public;
GRANT EXECUTE ON FUNCTION enqueue_report_pdf(UUID, BOOLEAN, INTEGER) TO authenticated;

-- ── 5. Drop legacy joiner override columns ────────────────────
ALTER TABLE student_year_records
  DROP COLUMN IF EXISTS fa1_weight_override,
  DROP COLUMN IF EXISTS fa2_weight_override,
  DROP COLUMN IF EXISTS summative_weight_override;

-- ── 6. Biweekly integration ───────────────────────────────────
-- Seed biweekly template for every existing school (idempotent on code).
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN SELECT id FROM schools LOOP
    IF NOT EXISTS (
      SELECT 1 FROM assessment_templates
      WHERE school_id = s.id AND code = 'biweekly'
    ) THEN
      INSERT INTO assessment_templates
        (school_id, section_id, name, code, weight_percent, max_marks, is_on_report, order_index, is_active)
      VALUES
        (s.id, NULL, 'Biweekly Tests', 'biweekly', 0, 20, false, 3, true);
    END IF;
  END LOOP;
END $$;

-- Extend seed function so new schools also get a biweekly template
CREATE OR REPLACE FUNCTION seed_grading_defaults()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO grading_scales (school_id, grade_label, min_percentage, max_percentage, description, order_index) VALUES
    (NEW.id, 'A*', 90, 100, 'Outstanding',     0),
    (NEW.id, 'A',  80, 89,  'Excellent',        1),
    (NEW.id, 'B',  70, 79,  'Above Average',    2),
    (NEW.id, 'C',  60, 69,  'Average',          3),
    (NEW.id, 'D',  50, 59,  'Below Average',    4),
    (NEW.id, 'E',  40, 49,  'Poor',             5),
    (NEW.id, 'F',  30, 39,  'Very Poor',        6),
    (NEW.id, 'G',  20, 29,  'Minimal',          7),
    (NEW.id, 'U',   0, 19,  'Ungraded',         8);

  INSERT INTO character_frameworks (school_id) VALUES (NEW.id);

  INSERT INTO assessment_templates (school_id, section_id, name, code, weight_percent, max_marks, is_on_report, order_index, is_active)
  VALUES
    (NEW.id, NULL, 'Formative 1',    'fa1',       20, 100, true,  0, true),
    (NEW.id, NULL, 'Formative 2',    'fa2',       20, 100, true,  1, true),
    (NEW.id, NULL, 'Summative',      'summative', 60, 100, true,  2, true),
    (NEW.id, NULL, 'Biweekly Tests', 'biweekly',   0,  20, false, 3, true);

  RETURN NEW;
END;
$$;

-- Drop the unused biweekly_records table (audit confirmed no writes)
DROP TABLE IF EXISTS biweekly_records;

-- ── 7. Rewrite calculate_student_total ────────────────────────
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
  v_any          BOOLEAN := false;
  v_all_present  BOOLEAN := true;
  rec            RECORD;
  v_mark_val     DECIMAL;
  v_weight       DECIMAL;
  v_max_marks    DECIMAL;
  v_pct          DECIMAL;
  v_exempt       BOOLEAN;
  v_student_w    DECIMAL;
BEGIN
  SELECT school_id, grade_id, stream_id
  INTO   v_school_id, v_grade_id, v_stream_id
  FROM   students WHERE id = p_student_id;

  FOR rec IN
    SELECT at.id, at.code, at.weight_percent, at.max_marks
    FROM   assessment_templates at
    WHERE  at.school_id  = v_school_id
      AND  at.is_active  = true
      AND  at.code IS NOT NULL
      AND (
        NOT EXISTS (SELECT 1 FROM assessment_template_grades atg WHERE atg.assessment_template_id = at.id)
        OR  EXISTS (SELECT 1 FROM assessment_template_grades atg WHERE atg.assessment_template_id = at.id AND atg.grade_id = v_grade_id)
      )
    ORDER BY at.order_index
  LOOP
    -- Per-student exemption / override
    SELECT is_exempt, weight_override
    INTO   v_exempt, v_student_w
    FROM   student_assessment_overrides
    WHERE  student_id = p_student_id
      AND  semester_id = p_semester_id
      AND  assessment_template_id = rec.id;

    IF COALESCE(v_exempt, false) THEN
      CONTINUE;  -- exempted template — neither contributes nor blocks
    END IF;

    -- Effective weight: student override > stream override > template default
    v_weight := COALESCE(
      v_student_w,
      (SELECT weight_override FROM assessment_template_streams
         WHERE assessment_template_id = rec.id AND stream_id = v_stream_id),
      rec.weight_percent
    );

    -- Skip zero-weight templates (e.g. biweekly default)
    IF v_weight = 0 THEN CONTINUE; END IF;

    v_max_marks := COALESCE(rec.max_marks, 100);

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
      v_pct          := (v_mark_val / v_max_marks) * 100.0;
      v_raw          := v_raw + (v_pct * v_weight / 100.0);
      v_total_weight := v_total_weight + v_weight;
      v_any          := true;
    END IF;
  END LOOP;

  IF NOT v_any OR NOT v_all_present THEN
    v_raw := NULL;
  END IF;

  RETURN QUERY SELECT
    v_raw,
    CASE WHEN v_raw IS NOT NULL THEN ROUND(v_raw)::INTEGER ELSE NULL END,
    CASE WHEN v_raw IS NOT NULL THEN get_grade_label(v_school_id, ROUND(v_raw)) ELSE NULL END;
END;
$$;

-- ── 8. Grading-scale gap coverage validation ─────────────────
CREATE OR REPLACE FUNCTION validate_grading_scale_coverage(p_school_id UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE AS $$
DECLARE
  rec      RECORD;
  v_prev   INTEGER := -1;
  v_count  INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM grading_scales WHERE school_id = p_school_id;
  IF v_count = 0 THEN RETURN NULL; END IF;

  -- Detect overlap
  IF EXISTS (
    SELECT 1
    FROM grading_scales g1, grading_scales g2
    WHERE g1.school_id = p_school_id
      AND g2.school_id = p_school_id
      AND g1.id <> g2.id
      AND g1.min_percentage <= g2.max_percentage
      AND g2.min_percentage <= g1.max_percentage
  ) THEN
    RETURN 'Grading scales overlap. Each percentage must map to one grade.';
  END IF;

  -- Walk sorted ranges; verify continuous 0..100 coverage
  FOR rec IN
    SELECT min_percentage, max_percentage
    FROM   grading_scales
    WHERE  school_id = p_school_id
    ORDER BY min_percentage
  LOOP
    IF v_prev = -1 THEN
      IF rec.min_percentage > 0 THEN
        RETURN 'Gap: 0–' || (rec.min_percentage - 1) || ' is uncovered.';
      END IF;
    ELSE
      IF rec.min_percentage > v_prev + 1 THEN
        RETURN 'Gap: ' || (v_prev + 1) || '–' || (rec.min_percentage - 1) || ' is uncovered.';
      END IF;
    END IF;
    v_prev := rec.max_percentage;
  END LOOP;

  IF v_prev < 100 THEN
    RETURN 'Gap: ' || (v_prev + 1) || '–100 is uncovered.';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION trg_grading_scale_validate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_school_id UUID;
  v_err       TEXT;
BEGIN
  v_school_id := COALESCE(NEW.school_id, OLD.school_id);
  v_err := validate_grading_scale_coverage(v_school_id);
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'Grading scale invalid: %', v_err;
  END IF;
  RETURN NEW;
END;
$$;

-- Constraint trigger so it fires after the row change has been visible
DROP TRIGGER IF EXISTS trg_grading_scale_validate_ins ON grading_scales;
CREATE CONSTRAINT TRIGGER trg_grading_scale_validate_ins
  AFTER INSERT OR UPDATE OR DELETE ON grading_scales
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_grading_scale_validate();

-- ── 9. Cron registration for PDF runner ───────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    -- Remove prior registration
    PERFORM cron.unschedule('report-pdf-runner')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'report-pdf-runner');

    PERFORM cron.schedule(
      'report-pdf-runner',
      '* * * * *',
      $cron$
        SELECT extensions.http_post(
          url     := current_setting('app.settings.supabase_url', true)
                     || '/functions/v1/generate-report-pdf-runner',
          body    := '{}',
          headers := json_build_object(
                       'Content-Type',  'application/json',
                       'Authorization',
                       'Bearer ' || current_setting('app.settings.service_role_key', true)
                     )::jsonb,
          timeout_milliseconds := 25000
        );
      $cron$
    );
  END IF;
END $$;
