-- ============================================================
-- 076_live_adjustments.sql — M8: Live timetable adjustments
-- teacher_absences, slot_overrides, slot_swap_requests + auto-cover triggers
-- ============================================================

-- ── 1. teacher_absences ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS teacher_absences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  reason          TEXT NOT NULL DEFAULT 'sick'
                   CHECK (reason IN ('sick','leave','training','personal','other')),
  cover_strategy  TEXT NOT NULL DEFAULT 'auto_substitute'
                   CHECK (cover_strategy IN ('auto_substitute','study_hall','cancel','manual')),
  notes           TEXT,
  reported_by     UUID REFERENCES staff(id) ON DELETE SET NULL,
  reported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','covered','partial')),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_ta_school_dates ON teacher_absences(school_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_ta_staff        ON teacher_absences(staff_id);

-- ── 2. slot_overrides ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS slot_overrides (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  timetable_id        UUID NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
  base_slot_id        UUID NOT NULL REFERENCES timetable_slots(id) ON DELETE CASCADE,
  override_date       DATE NOT NULL,
  override_subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  override_staff_id   UUID REFERENCES staff(id) ON DELETE SET NULL,
  override_room_id    UUID REFERENCES rooms(id) ON DELETE SET NULL,
  override_type       TEXT NOT NULL DEFAULT 'substitute'
                       CHECK (override_type IN ('substitute','swap','cancel','room_change','added_lesson')),
  source              TEXT NOT NULL DEFAULT 'admin_manual'
                       CHECK (source IN ('absence_auto','admin_manual','swap_request')),
  linked_absence_id   UUID REFERENCES teacher_absences(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','reverted')),
  created_by          UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes               TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_so_slot_date_active
  ON slot_overrides(base_slot_id, override_date)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_so_school_date  ON slot_overrides(school_id, override_date);
CREATE INDEX IF NOT EXISTS idx_so_timetable    ON slot_overrides(timetable_id);
CREATE INDEX IF NOT EXISTS idx_so_absence      ON slot_overrides(linked_absence_id);

-- ── 3. slot_swap_requests ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS slot_swap_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  timetable_id        UUID NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
  requester_staff_id  UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  target_staff_id     UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  requester_slot_id   UUID NOT NULL REFERENCES timetable_slots(id) ON DELETE CASCADE,
  target_slot_id      UUID NOT NULL REFERENCES timetable_slots(id) ON DELETE CASCADE,
  swap_date           DATE NOT NULL,
  reason              TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','approved','rejected','expired')),
  responded_at        TIMESTAMPTZ,
  decided_by          UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ssr_requester ON slot_swap_requests(requester_staff_id, status);
CREATE INDEX IF NOT EXISTS idx_ssr_target    ON slot_swap_requests(target_staff_id, status);
CREATE INDEX IF NOT EXISTS idx_ssr_school    ON slot_swap_requests(school_id);

-- ── 4. RLS ───────────────────────────────────────────────────

DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'teacher_absences','slot_overrides','slot_swap_requests'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "si_%I" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "si_%I" ON %I FOR ALL TO authenticated
       USING (school_id = (auth.jwt()->''app_metadata''->>''school_id'')::uuid)
       WITH CHECK (school_id = (auth.jwt()->''app_metadata''->>''school_id'')::uuid)',
      t, t
    );
  END LOOP;
END $$;

-- ── 5. Effective timetable function ──────────────────────────
-- Returns base slots merged with active overrides for a given stream + date.

CREATE OR REPLACE FUNCTION get_effective_timetable(p_stream_id uuid, p_date date)
RETURNS TABLE (
  slot_id          uuid,
  day_of_week      int,
  period_index     int,
  subject_id       uuid,
  staff_id         uuid,
  room_id          uuid,
  slot_type        text,
  is_cancelled     boolean,
  override_type    text,
  override_id      uuid
) LANGUAGE sql STABLE AS $$
  SELECT
    s.id                                AS slot_id,
    s.day_of_week,
    s.period_index,
    COALESCE(o.override_subject_id, s.subject_id) AS subject_id,
    COALESCE(o.override_staff_id,   s.staff_id)   AS staff_id,
    COALESCE(o.override_room_id,    s.room_id)     AS room_id,
    s.slot_type,
    (o.override_type = 'cancel')                   AS is_cancelled,
    o.override_type,
    o.id                                            AS override_id
  FROM timetable_slots s
  JOIN timetables t ON t.id = s.timetable_id
  LEFT JOIN slot_overrides o
    ON  o.base_slot_id    = s.id
    AND o.override_date   = p_date
    AND o.status          = 'active'
  WHERE t.status        = 'published'
    AND s.stream_id      = p_stream_id
    AND s.day_of_week    = EXTRACT(ISODOW FROM p_date)::int
    AND t.school_id      = (auth.jwt()->'app_metadata'->>'school_id')::uuid
  ORDER BY s.period_index;
$$;

-- Variant for teachers
CREATE OR REPLACE FUNCTION get_effective_teacher_schedule(p_staff_id uuid, p_date date)
RETURNS TABLE (
  slot_id       uuid,
  stream_id     uuid,
  day_of_week   int,
  period_index  int,
  subject_id    uuid,
  room_id       uuid,
  slot_type     text,
  is_cancelled  boolean,
  override_type text,
  override_id   uuid
) LANGUAGE sql STABLE AS $$
  SELECT
    s.id,
    s.stream_id,
    s.day_of_week,
    s.period_index,
    COALESCE(o.override_subject_id, s.subject_id) AS subject_id,
    COALESCE(o.override_room_id,    s.room_id)     AS room_id,
    s.slot_type,
    (o.override_type = 'cancel')                   AS is_cancelled,
    o.override_type,
    o.id                                            AS override_id
  FROM timetable_slots s
  JOIN timetables t ON t.id = s.timetable_id
  LEFT JOIN slot_overrides o
    ON  o.base_slot_id   = s.id
    AND o.override_date  = p_date
    AND o.status         = 'active'
  WHERE t.status        = 'published'
    AND s.day_of_week   = EXTRACT(ISODOW FROM p_date)::int
    AND t.school_id     = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (
      s.staff_id = p_staff_id
      OR o.override_staff_id = p_staff_id
    )
  ORDER BY s.period_index;
$$;

-- ── 6. Override-drift trigger ─────────────────────────────────
-- When a base slot is edited, revert active overrides for future dates
-- so orphan overrides don't silently mislead users.

CREATE OR REPLACE FUNCTION revert_orphan_overrides()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.staff_id IS DISTINCT FROM OLD.staff_id
      OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
      OR NEW.room_id IS DISTINCT FROM OLD.room_id) THEN
    UPDATE slot_overrides
      SET status = 'reverted'
    WHERE base_slot_id = NEW.id
      AND status       = 'active'
      AND override_date >= CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revert_overrides ON timetable_slots;
CREATE TRIGGER trg_revert_overrides
  AFTER UPDATE ON timetable_slots
  FOR EACH ROW EXECUTE FUNCTION revert_orphan_overrides();

-- ── 7. module.timetable_live_adjust already seeded in 075 ────
-- (no-op; just assert)
-- INSERT ... ON CONFLICT DO NOTHING is already in 075.
