-- ============================================================
-- 004_grading.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS grading_scales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  grade_label    TEXT NOT NULL,
  min_percentage INTEGER NOT NULL,
  max_percentage INTEGER NOT NULL,
  description    TEXT,
  order_index    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (school_id, grade_label)
);

CREATE TABLE IF NOT EXISTS assessment_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  section_id  UUID REFERENCES school_sections(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  weight_percent DECIMAL(5,2),
  is_on_report   BOOLEAN NOT NULL DEFAULT true,
  order_index    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS character_frameworks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
  is_enabled   BOOLEAN NOT NULL DEFAULT true,
  value_names  JSONB NOT NULL DEFAULT '["Creativity","Respect","Excellence","Empathy","Discipline"]',
  rating_scale TEXT NOT NULL DEFAULT 'cambridge'
    CHECK (rating_scale IN ('cambridge','developmental'))
);

-- ── Seed grading defaults when school created ─────────────────
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
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_grading
AFTER INSERT ON schools
FOR EACH ROW EXECUTE FUNCTION seed_grading_defaults();

-- ── DB Function: resolve grade label from percentage ──────────
CREATE OR REPLACE FUNCTION get_grade_label(p_school_id UUID, p_pct DECIMAL)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT grade_label FROM grading_scales
  WHERE school_id = p_school_id
    AND p_pct >= min_percentage
    AND p_pct <= max_percentage
  LIMIT 1;
$$;

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE grading_scales        ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_frameworks  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "si_grading_scales"       ON grading_scales       FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
DROP POLICY IF EXISTS "si_assessment_templates" ON assessment_templates;
CREATE POLICY "si_assessment_templates" ON assessment_templates FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
DROP POLICY IF EXISTS "si_character_frameworks" ON character_frameworks;
CREATE POLICY "si_character_frameworks" ON character_frameworks FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_grading_school ON grading_scales(school_id);
CREATE INDEX IF NOT EXISTS idx_at_school      ON assessment_templates(school_id);
CREATE INDEX IF NOT EXISTS idx_at_section     ON assessment_templates(section_id);
