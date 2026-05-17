-- ============================================================
-- 047_assessment_config.sql
-- Dynamic per-school assessment configuration
-- Extends assessment_templates (004_grading.sql) with:
--   • code column (maps to marks.assessment_type)
--   • is_active column
--   • grade-level junction table
--   • drops hardcoded marks.assessment_type CHECK
--   • rewritten calculate_student_total() using dynamic weights
--   • seeds existing schools with fa1/fa2/summative defaults
-- ============================================================

-- ── 1. Extend assessment_templates ───────────────────────────
ALTER TABLE assessment_templates
  ADD COLUMN IF NOT EXISTS code      TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_at_school_code
  ON assessment_templates(school_id, code)
  WHERE code IS NOT NULL;

-- ── 2. Grade-level scoping junction ──────────────────────────
-- Empty = applies to all grades in the school.
CREATE TABLE IF NOT EXISTS assessment_template_grades (
  assessment_template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  grade_id               UUID NOT NULL REFERENCES grades(id)               ON DELETE CASCADE,
  PRIMARY KEY (assessment_template_id, grade_id)
);

ALTER TABLE assessment_template_grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "si_atg" ON assessment_template_grades FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assessment_templates at
      WHERE at.id = assessment_template_id
        AND at.school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    )
  );

CREATE INDEX IF NOT EXISTS idx_atg_template ON assessment_template_grades(assessment_template_id);
CREATE INDEX IF NOT EXISTS idx_atg_grade    ON assessment_template_grades(grade_id);

-- ── 3. Drop hardcoded CHECK on marks.assessment_type ─────────
ALTER TABLE marks DROP CONSTRAINT IF EXISTS marks_assessment_type_check;

-- ── 4. Seed defaults for existing schools ────────────────────
-- Only inserts where school has no coded templates yet.
-- Uses DO block to handle the three types atomically.
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN SELECT id FROM schools LOOP
    IF NOT EXISTS (SELECT 1 FROM assessment_templates WHERE school_id = s.id AND code IS NOT NULL) THEN
      INSERT INTO assessment_templates (school_id, section_id, name, code, weight_percent, is_on_report, order_index, is_active)
      VALUES
        (s.id, NULL, 'Formative 1', 'fa1',       20, true, 0, true),
        (s.id, NULL, 'Formative 2', 'fa2',       20, true, 1, true),
        (s.id, NULL, 'Summative',   'summative', 60, true, 2, true);
    END IF;
  END LOOP;
END;
$$;

-- ── 5. Also seed new schools via existing trigger ─────────────
-- Extend seed_grading_defaults to insert default assessment templates.
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

  INSERT INTO assessment_templates (school_id, section_id, name, code, weight_percent, is_on_report, order_index, is_active)
  VALUES
    (NEW.id, NULL, 'Formative 1', 'fa1',       20, true, 0, true),
    (NEW.id, NULL, 'Formative 2', 'fa2',       20, true, 1, true),
    (NEW.id, NULL, 'Summative',   'summative', 60, true, 2, true);

  RETURN NEW;
END;
$$;

-- ── 6. Rewrite calculate_student_total() ─────────────────────
-- Now dynamic: reads weights from assessment_templates,
-- filtered by grade-level restrictions for the student.
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
  v_raw          DECIMAL := 0;
  v_total_weight DECIMAL := 0;
  v_has_any      BOOLEAN := false;
  v_all_present  BOOLEAN := true;
  rec            RECORD;
  v_mark_val     DECIMAL;
BEGIN
  SELECT school_id, grade_id INTO v_school_id, v_grade_id
  FROM students WHERE id = p_student_id;

  FOR rec IN
    SELECT at.code, at.weight_percent
    FROM assessment_templates at
    WHERE at.school_id  = v_school_id
      AND at.is_active  = true
      AND at.code IS NOT NULL
      AND at.code      != 'biweekly'
      -- grade filter: no restrictions = all grades; otherwise must match
      AND (
        NOT EXISTS (SELECT 1 FROM assessment_template_grades atg WHERE atg.assessment_template_id = at.id)
        OR  EXISTS (SELECT 1 FROM assessment_template_grades atg WHERE atg.assessment_template_id = at.id AND atg.grade_id = v_grade_id)
      )
    ORDER BY at.order_index
  LOOP
    SELECT value INTO v_mark_val
    FROM marks
    WHERE student_id    = p_student_id
      AND semester_id   = p_semester_id
      AND subject_id    = p_subject_id
      AND assessment_type = rec.code
      AND NOT is_excused;

    IF v_mark_val IS NULL THEN
      v_all_present := false;
    ELSE
      v_raw          := v_raw + (v_mark_val * rec.weight_percent / 100.0);
      v_total_weight := v_total_weight + rec.weight_percent;
      v_has_any      := true;
    END IF;
  END LOOP;

  -- Require all expected marks present; return NULL if any missing
  IF NOT v_has_any OR NOT v_all_present THEN
    v_raw := NULL;
  END IF;

  RETURN QUERY SELECT
    v_raw,
    CASE WHEN v_raw IS NOT NULL THEN ROUND(v_raw)::INTEGER ELSE NULL END,
    CASE WHEN v_raw IS NOT NULL THEN get_grade_label(v_school_id, ROUND(v_raw)) ELSE NULL END;
END;
$$;
