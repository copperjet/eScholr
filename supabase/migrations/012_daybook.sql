-- ============================================================
-- 012_daybook.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS day_book_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date                  DATE NOT NULL DEFAULT CURRENT_DATE,
  category              TEXT NOT NULL CHECK (category IN (
    'behaviour_minor','behaviour_serious','academic_concern',
    'achievement','attendance_note','health','communication','other'
  )),
  description           TEXT NOT NULL,
  created_by            UUID NOT NULL REFERENCES staff(id),
  send_to_parent        BOOLEAN NOT NULL DEFAULT false,
  edit_window_closes_at TIMESTAMPTZ NOT NULL,
  archived              BOOLEAN NOT NULL DEFAULT false,
  archived_by           UUID REFERENCES staff(id),
  archived_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-set edit_window_closes_at = now() + 15 min
CREATE OR REPLACE FUNCTION set_edit_window()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.edit_window_closes_at := now() + INTERVAL '15 minutes';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_edit_window ON day_book_entries;
CREATE TRIGGER trg_edit_window BEFORE INSERT ON day_book_entries
FOR EACH ROW EXECUTE FUNCTION set_edit_window();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE day_book_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "si_daybook" ON day_book_entries;
CREATE POLICY "si_daybook" ON day_book_entries FOR ALL TO authenticated
  USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_dbe_student   ON day_book_entries(student_id);
CREATE INDEX IF NOT EXISTS idx_dbe_created   ON day_book_entries(created_by);
CREATE INDEX IF NOT EXISTS idx_dbe_date      ON day_book_entries(date DESC);
CREATE INDEX IF NOT EXISTS idx_dbe_school    ON day_book_entries(school_id);
CREATE INDEX IF NOT EXISTS idx_dbe_parent    ON day_book_entries(send_to_parent) WHERE send_to_parent = true;
