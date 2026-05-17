-- ============================================================
-- 079_subject_colors_seed.sql — R2.7
-- Auto-seed 12 distinct WCAG-AA subject colors per school on
-- first generate, and keep the palette fresh as subjects are added.
-- ============================================================

-- ── 1. Seed function (idempotent, called after generation) ────

CREATE OR REPLACE FUNCTION seed_subject_colors(p_school_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- 12 WCAG-AA contrast pairs (bg / fg) — perceptually distinct
  palette_bg  TEXT[] := ARRAY[
    '#EFF6FF','#F0FDF4','#FFF7ED','#FDF4FF','#FFFBEB','#F0F9FF',
    '#FFF1F2','#ECFDF5','#F5F3FF','#FEF3C7','#E0F2FE','#FCE7F3'
  ];
  palette_fg  TEXT[] := ARRAY[
    '#1D4ED8','#15803D','#C2410C','#7E22CE','#92400E','#0369A1',
    '#BE123C','#065F46','#4C1D95','#78350F','#075985','#9D174D'
  ];
  palette_icons TEXT[] := ARRAY[
    'book-outline','flask-outline','calculator-outline','musical-notes-outline',
    'football-outline','globe-outline','leaf-outline','color-palette-outline',
    'language-outline','stats-chart-outline','hardware-chip-outline','people-outline'
  ];
  subject_row RECORD;
  color_idx   INT := 0;
BEGIN
  FOR subject_row IN
    SELECT s.id
    FROM   subjects s
    WHERE  s.school_id = p_school_id
    ORDER  BY s.name
  LOOP
    INSERT INTO subject_colors (school_id, subject_id, bg_color, fg_color, icon_name)
    VALUES (
      p_school_id,
      subject_row.id,
      palette_bg[  (color_idx % 12) + 1 ],
      palette_fg[  (color_idx % 12) + 1 ],
      palette_icons[(color_idx % 12) + 1 ]
    )
    ON CONFLICT (school_id, subject_id) DO NOTHING;
    color_idx := color_idx + 1;
  END LOOP;
END;
$$;

-- ── 2. Trigger: auto-seed when a new subject is inserted ──────

CREATE OR REPLACE FUNCTION trigger_seed_subject_color()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  next_idx INT;
  palette_bg  TEXT[] := ARRAY[
    '#EFF6FF','#F0FDF4','#FFF7ED','#FDF4FF','#FFFBEB','#F0F9FF',
    '#FFF1F2','#ECFDF5','#F5F3FF','#FEF3C7','#E0F2FE','#FCE7F3'
  ];
  palette_fg  TEXT[] := ARRAY[
    '#1D4ED8','#15803D','#C2410C','#7E22CE','#92400E','#0369A1',
    '#BE123C','#065F46','#4C1D95','#78350F','#075985','#9D174D'
  ];
  palette_icons TEXT[] := ARRAY[
    'book-outline','flask-outline','calculator-outline','musical-notes-outline',
    'football-outline','globe-outline','leaf-outline','color-palette-outline',
    'language-outline','stats-chart-outline','hardware-chip-outline','people-outline'
  ];
BEGIN
  -- Count how many colors already exist for this school (for round-robin index)
  SELECT COUNT(*) INTO next_idx
  FROM subject_colors
  WHERE school_id = NEW.school_id;

  INSERT INTO subject_colors (school_id, subject_id, bg_color, fg_color, icon_name)
  VALUES (
    NEW.school_id,
    NEW.id,
    palette_bg[  (next_idx % 12) + 1 ],
    palette_fg[  (next_idx % 12) + 1 ],
    palette_icons[(next_idx % 12) + 1 ]
  )
  ON CONFLICT (school_id, subject_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subject_color_seed ON subjects;
CREATE TRIGGER trg_subject_color_seed
  AFTER INSERT ON subjects
  FOR EACH ROW EXECUTE FUNCTION trigger_seed_subject_color();

-- ── 3. Backfill existing schools ─────────────────────────────

DO $$
DECLARE school_row RECORD;
BEGIN
  FOR school_row IN SELECT DISTINCT school_id FROM subjects LOOP
    PERFORM seed_subject_colors(school_row.school_id);
  END LOOP;
END $$;
