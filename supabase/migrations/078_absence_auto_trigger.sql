-- ============================================================
-- 078_absence_auto_trigger.sql — R2.4 + R2.6
--
-- R2.4: DB trigger on teacher_absences INSERT → calls
--       auto-cover-absences edge function via pg_net when
--       cover_strategy = 'auto_substitute'.
--
-- R2.6: DB trigger on timetable_slots AFTER UPDATE →
--       recomputes teacher_clash + room_clash conflicts
--       for the edited slot (server-side, real-time).
-- ============================================================

-- ── Enable pg_net extension (idempotent) ─────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── R2.4: Auto-cover trigger on absence insert ────────────────

CREATE OR REPLACE FUNCTION trigger_auto_cover_absence()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  edge_url  TEXT;
  svc_key   TEXT;
BEGIN
  -- Only fire for auto_substitute strategy
  IF NEW.cover_strategy <> 'auto_substitute' THEN
    RETURN NEW;
  END IF;

  -- Read env-like settings from vault / app_settings
  -- (Supabase edge URL is always predictable from project ref)
  edge_url := current_setting('app.settings.supabase_url', true)
    || '/functions/v1/auto-cover-absences';
  svc_key  := current_setting('app.settings.service_role_key', true);

  -- Fire-and-forget HTTP POST via pg_net
  PERFORM extensions.http_post(
    url    := edge_url,
    body   := json_build_object(
                'absence_id', NEW.id::text,
                'school_id',  NEW.school_id::text,
                'dry_run',    false
              )::text,
    params := '{}'::jsonb,
    headers := json_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || svc_key
               )::jsonb,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Non-fatal: log warning but don't block absence insert
  RAISE WARNING 'auto-cover trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_absence_auto_cover ON teacher_absences;
CREATE TRIGGER trg_absence_auto_cover
  AFTER INSERT ON teacher_absences
  FOR EACH ROW EXECUTE FUNCTION trigger_auto_cover_absence();

-- ── R2.6: Slot conflict recompute on slot edit ────────────────

CREATE OR REPLACE FUNCTION recompute_slot_conflicts(
  p_timetable_id UUID,
  p_slot_id      UUID
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_slot       timetable_slots%ROWTYPE;
  v_clash_slot UUID;
BEGIN
  -- Fetch the edited slot
  SELECT * INTO v_slot FROM timetable_slots WHERE id = p_slot_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Remove existing unresolved conflicts referencing this slot
  DELETE FROM timetable_conflicts
  WHERE timetable_id = p_timetable_id
    AND resolved = false
    AND (slot_id = p_slot_id OR conflicting_slot_id = p_slot_id);

  -- Only lesson slots generate teacher/room clash conflicts
  IF v_slot.slot_type <> 'lesson' THEN RETURN; END IF;

  -- Teacher clash: any other lesson in same timetable at same day+period with same teacher
  IF v_slot.staff_id IS NOT NULL THEN
    SELECT id INTO v_clash_slot
    FROM timetable_slots
    WHERE timetable_id   = p_timetable_id
      AND id            <> p_slot_id
      AND slot_type      = 'lesson'
      AND day_of_week    = v_slot.day_of_week
      AND period_index   = v_slot.period_index
      AND staff_id       = v_slot.staff_id
    LIMIT 1;

    IF FOUND THEN
      INSERT INTO timetable_conflicts
        (timetable_id, slot_id, conflicting_slot_id, severity, kind, description, resolved)
      VALUES
        (p_timetable_id, p_slot_id, v_clash_slot,
         'error', 'teacher_clash',
         'Teacher double-booked at day ' || v_slot.day_of_week || ' period ' || v_slot.period_index,
         false);
    END IF;
  END IF;

  -- Room clash: any other lesson at same day+period with same room
  IF v_slot.room_id IS NOT NULL THEN
    SELECT id INTO v_clash_slot
    FROM timetable_slots
    WHERE timetable_id  = p_timetable_id
      AND id           <> p_slot_id
      AND slot_type     = 'lesson'
      AND day_of_week   = v_slot.day_of_week
      AND period_index  = v_slot.period_index
      AND room_id       = v_slot.room_id
    LIMIT 1;

    IF FOUND THEN
      INSERT INTO timetable_conflicts
        (timetable_id, slot_id, conflicting_slot_id, severity, kind, description, resolved)
      VALUES
        (p_timetable_id, p_slot_id, v_clash_slot,
         'error', 'room_clash',
         'Room double-booked at day ' || v_slot.day_of_week || ' period ' || v_slot.period_index,
         false);
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION trigger_slot_conflict_recompute()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only recompute if assignment-relevant columns changed
  IF (NEW.staff_id   IS DISTINCT FROM OLD.staff_id
   OR NEW.room_id    IS DISTINCT FROM OLD.room_id
   OR NEW.day_of_week IS DISTINCT FROM OLD.day_of_week
   OR NEW.period_index IS DISTINCT FROM OLD.period_index
   OR NEW.slot_type  IS DISTINCT FROM OLD.slot_type) THEN
    PERFORM recompute_slot_conflicts(NEW.timetable_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_slot_conflict_recompute ON timetable_slots;
CREATE TRIGGER trg_slot_conflict_recompute
  AFTER UPDATE ON timetable_slots
  FOR EACH ROW EXECUTE FUNCTION trigger_slot_conflict_recompute();
