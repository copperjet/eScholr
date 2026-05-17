-- ============================================================
-- 009_marks.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS marks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id              UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id              UUID NOT NULL REFERENCES subjects(id),
  stream_id               UUID NOT NULL REFERENCES streams(id),
  semester_id             UUID NOT NULL REFERENCES semesters(id),
  assessment_type         TEXT NOT NULL CHECK (assessment_type IN ('fa1','fa2','summative','biweekly')),
  value                   DECIMAL(5,2) CHECK (value IS NULL OR (value >= 0 AND value <= 100)),
  raw_total               DECIMAL(8,4),
  is_excused              BOOLEAN NOT NULL DEFAULT false,
  excused_reason          TEXT,
  is_locked               BOOLEAN NOT NULL DEFAULT false,
  correction_unlocked_by  UUID REFERENCES staff(id),
  correction_unlocked_at  TIMESTAMPTZ,
  entered_by              UUID REFERENCES staff(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, semester_id, assessment_type)
);

CREATE TABLE IF NOT EXISTS mark_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  mark_id     UUID NOT NULL REFERENCES marks(id),
  student_id  UUID NOT NULL REFERENCES students(id),
  subject_id  UUID NOT NULL REFERENCES subjects(id),
  old_value   DECIMAL(5,2),
  new_value   DECIMAL(5,2),
  changed_by  UUID NOT NULL REFERENCES staff(id),
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mark_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  mark_id     UUID NOT NULL REFERENCES marks(id),
  note_type   TEXT NOT NULL CHECK (note_type IN ('deviation_warning','correction_note','admin_note')),
  note_text   TEXT NOT NULL,
  created_by  UUID NOT NULL REFERENCES staff(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS biweekly_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES subjects(id),
  semester_id UUID NOT NULL REFERENCES semesters(id),
  date        DATE NOT NULL,
  raw_score   DECIMAL(5,2) NOT NULL,
  entered_by  UUID NOT NULL REFERENCES staff(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Calculate student total mark ──────────────────────────────
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
  v_fa1       DECIMAL; v_fa2 DECIMAL; v_sum DECIMAL;
  v_fa1_w     DECIMAL := 20; v_fa2_w DECIMAL := 20; v_sum_w DECIMAL := 60;
  v_school_id UUID;
  v_raw       DECIMAL;
BEGIN
  SELECT school_id INTO v_school_id FROM students WHERE id = p_student_id;

  -- Get weight overrides for mid-semester joiners
  SELECT COALESCE(fa1_weight_override, 20),
         COALESCE(fa2_weight_override, 20),
         COALESCE(summative_weight_override, 60)
  INTO   v_fa1_w, v_fa2_w, v_sum_w
  FROM   student_year_records
  WHERE  student_id = p_student_id AND semester_id = p_semester_id;

  SELECT value INTO v_fa1 FROM marks
  WHERE student_id=p_student_id AND semester_id=p_semester_id
    AND subject_id=p_subject_id AND assessment_type='fa1' AND NOT is_excused;
  SELECT value INTO v_fa2 FROM marks
  WHERE student_id=p_student_id AND semester_id=p_semester_id
    AND subject_id=p_subject_id AND assessment_type='fa2' AND NOT is_excused;
  SELECT value INTO v_sum FROM marks
  WHERE student_id=p_student_id AND semester_id=p_semester_id
    AND subject_id=p_subject_id AND assessment_type='summative' AND NOT is_excused;

  -- If all three components exist: weighted average
  IF v_fa1 IS NOT NULL AND v_fa2 IS NOT NULL AND v_sum IS NOT NULL THEN
    v_raw := (v_fa1 * v_fa1_w/100) + (v_fa2 * v_fa2_w/100) + (v_sum * v_sum_w/100);
  -- If only summative (IGCSE+): use summative directly
  ELSIF v_sum IS NOT NULL AND v_fa1 IS NULL AND v_fa2 IS NULL THEN
    v_raw := v_sum;
  ELSE
    v_raw := NULL;
  END IF;

  RETURN QUERY SELECT
    v_raw,
    CASE WHEN v_raw IS NOT NULL THEN ROUND(v_raw)::INTEGER ELSE NULL END,
    CASE WHEN v_raw IS NOT NULL
      THEN get_grade_label(v_school_id, ROUND(v_raw))
      ELSE NULL
    END;
END;
$$;

-- ── Class average function ────────────────────────────────────
CREATE OR REPLACE FUNCTION get_class_average(
  p_subject_id    UUID,
  p_stream_id     UUID,
  p_semester_id   UUID,
  p_assessment_type TEXT
) RETURNS DECIMAL LANGUAGE sql STABLE AS $$
  SELECT ROUND(AVG(value)::DECIMAL, 1)
  FROM marks
  WHERE subject_id=p_subject_id
    AND stream_id=p_stream_id
    AND semester_id=p_semester_id
    AND assessment_type=p_assessment_type
    AND value IS NOT NULL
    AND NOT is_excused;
$$;

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE marks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE mark_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mark_notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE biweekly_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "si_marks"           ON marks           FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
DROP POLICY IF EXISTS "si_mark_audit_logs" ON mark_audit_logs;
CREATE POLICY "si_mark_audit_logs" ON mark_audit_logs FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
CREATE POLICY "si_mark_notes"      ON mark_notes      FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
CREATE POLICY "si_biweekly"        ON biweekly_records FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_marks_student   ON marks(student_id);
CREATE INDEX IF NOT EXISTS idx_marks_subject   ON marks(subject_id);
CREATE INDEX IF NOT EXISTS idx_marks_stream    ON marks(stream_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_marks_semester  ON marks(semester_id);
CREATE INDEX IF NOT EXISTS idx_mal_mark        ON mark_audit_logs(mark_id);
CREATE INDEX IF NOT EXISTS idx_mal_student     ON mark_audit_logs(student_id);
