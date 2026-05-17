-- ============================================================
-- 072_eca_rpcs.sql
-- ECA allocation RPCs
-- ============================================================

-- ── Helper: get parent record from auth.uid() ─────────────────
CREATE OR REPLACE FUNCTION eca_calling_parent_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM parents WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ── 1. Allocate one student in one category (FCFS, advisory lock) ──
CREATE OR REPLACE FUNCTION eca_allocate_student(
  p_student_id  UUID,
  p_category_id UUID
) RETURNS eca_assignments LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_existing  eca_assignments;
  v_choice    RECORD;
  v_capacity  INTEGER;
  v_count     INTEGER;
  v_result    eca_assignments;
BEGIN
  -- Serialise allocation per category
  PERFORM pg_advisory_xact_lock(hashtext(p_category_id::text));

  -- Return idempotent if already assigned/waitlisted
  SELECT * INTO v_existing
  FROM eca_assignments
  WHERE student_id = p_student_id
    AND category_id = p_category_id
    AND status <> 'withdrawn'
  LIMIT 1;

  IF FOUND THEN RETURN v_existing; END IF;

  -- Walk choices in rank order
  FOR v_choice IN
    SELECT ec.choice_rank, ec.activity_id, ec.school_id
    FROM   eca_choices ec
    WHERE  ec.student_id  = p_student_id
      AND  ec.category_id = p_category_id
    ORDER  BY ec.choice_rank ASC
  LOOP
    SELECT capacity INTO v_capacity
    FROM eca_activities
    WHERE id = v_choice.activity_id
    FOR UPDATE;

    SELECT COUNT(*) INTO v_count
    FROM eca_assignments
    WHERE activity_id = v_choice.activity_id
      AND status = 'assigned';

    IF v_count < v_capacity THEN
      INSERT INTO eca_assignments (
        school_id, student_id, category_id, activity_id,
        assigned_from_choice_rank, status, assigned_at, assigned_by
      ) VALUES (
        v_choice.school_id, p_student_id, p_category_id, v_choice.activity_id,
        v_choice.choice_rank, 'assigned', now(), auth.uid()
      )
      RETURNING * INTO v_result;
      RETURN v_result;
    END IF;
  END LOOP;

  -- All choices full → waitlist on first choice activity
  INSERT INTO eca_assignments (
    school_id, student_id, category_id, activity_id,
    assigned_from_choice_rank, status, assigned_at, assigned_by
  )
  SELECT school_id, p_student_id, p_category_id, activity_id,
         choice_rank, 'waitlisted', now(), auth.uid()
  FROM   eca_choices
  WHERE  student_id  = p_student_id
    AND  category_id = p_category_id
  ORDER  BY choice_rank ASC
  LIMIT  1
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- ── 2. Submit choices + immediately allocate ──────────────────
CREATE OR REPLACE FUNCTION eca_submit_choices(
  p_student_id  UUID,
  p_category_id UUID,
  p_choices     JSONB  -- [{rank: 1, activity_id: "..."}, ...]
) RETURNS eca_assignments LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_parent_id     UUID;
  v_school_id     UUID;
  v_cat           RECORD;
  v_choice        RECORD;
  v_activity      RECORD;
  v_student_stream UUID;
  v_rank_count    INTEGER;
BEGIN
  -- Resolve calling parent
  v_parent_id := eca_calling_parent_id();
  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'not_parent';
  END IF;

  -- Verify parent-student link
  IF NOT EXISTS (
    SELECT 1 FROM student_parent_links
    WHERE student_id = p_student_id AND parent_id = v_parent_id
  ) THEN
    RAISE EXCEPTION 'not_linked';
  END IF;

  -- Get category + school
  SELECT * INTO v_cat FROM eca_categories WHERE id = p_category_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'category_not_found'; END IF;
  v_school_id := v_cat.school_id;

  -- Get student stream
  SELECT stream_id INTO v_student_stream FROM students WHERE id = p_student_id;

  -- Validate choice count
  v_rank_count := jsonb_array_length(p_choices);
  IF v_rank_count < 1 OR v_rank_count > v_cat.max_choices THEN
    RAISE EXCEPTION 'invalid_choice_count';
  END IF;

  -- Validate each choice
  FOR v_choice IN SELECT * FROM jsonb_array_elements(p_choices) AS elem LOOP
    DECLARE
      v_act_id UUID := (v_choice.elem->>'activity_id')::UUID;
      v_rank   SMALLINT := (v_choice.elem->>'rank')::SMALLINT;
    BEGIN
      -- Activity exists and belongs to category
      SELECT * INTO v_activity
      FROM eca_activities
      WHERE id = v_act_id AND category_id = p_category_id AND school_id = v_school_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'activity_not_found'; END IF;

      -- Status must be published
      IF v_activity.status <> 'published' THEN
        RAISE EXCEPTION 'activity_not_published';
      END IF;

      -- Choice window open
      IF v_activity.choice_window_start IS NOT NULL AND now() < v_activity.choice_window_start THEN
        RAISE EXCEPTION 'out_of_window';
      END IF;
      IF v_activity.choice_window_end IS NOT NULL AND now() > v_activity.choice_window_end THEN
        RAISE EXCEPTION 'out_of_window';
      END IF;

      -- Student eligible (stream in eligible streams)
      IF NOT EXISTS (
        SELECT 1 FROM eca_activity_eligible_streams
        WHERE activity_id = v_act_id AND stream_id = v_student_stream
      ) THEN
        RAISE EXCEPTION 'not_eligible';
      END IF;
    END;
  END LOOP;

  -- Atomically replace prior choices for this student+category
  DELETE FROM eca_choices
  WHERE student_id = p_student_id AND category_id = p_category_id;

  INSERT INTO eca_choices (school_id, student_id, category_id, choice_rank, activity_id, submitted_by_parent_id)
  SELECT v_school_id, p_student_id, p_category_id,
         (elem->>'rank')::SMALLINT,
         (elem->>'activity_id')::UUID,
         v_parent_id
  FROM   jsonb_array_elements(p_choices) AS elem;

  -- Withdraw any existing assignment so re-allocation runs fresh
  UPDATE eca_assignments
  SET    status = 'withdrawn'
  WHERE  student_id  = p_student_id
    AND  category_id = p_category_id
    AND  status <> 'withdrawn';

  -- Allocate
  RETURN eca_allocate_student(p_student_id, p_category_id);
END;
$$;

-- ── 3. Admin sweep allocation for a category ──────────────────
CREATE OR REPLACE FUNCTION eca_run_allocation(
  p_category_id UUID
) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_student_id UUID;
  v_count      INTEGER := 0;
BEGIN
  FOR v_student_id IN
    SELECT DISTINCT ec.student_id
    FROM   eca_choices ec
    WHERE  ec.category_id = p_category_id
      AND  NOT EXISTS (
        SELECT 1 FROM eca_assignments ea
        WHERE ea.student_id  = ec.student_id
          AND ea.category_id = p_category_id
          AND ea.status <> 'withdrawn'
      )
    ORDER  BY (
      SELECT MIN(submitted_at) FROM eca_choices
      WHERE student_id = ec.student_id AND category_id = p_category_id
    ) ASC
  LOOP
    PERFORM eca_allocate_student(v_student_id, p_category_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── 4. Withdraw + auto-promote from waitlist ──────────────────
-- Returns JSONB with optional `promoted_student_id`, `promoted_activity_id`,
-- and `school_id` so callers can fire a notification to the promoted parent.
CREATE OR REPLACE FUNCTION eca_withdraw_assignment(
  p_assignment_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_asgn       eca_assignments;
  v_waitlisted UUID;
  v_new_asgn   eca_assignments;
BEGIN
  SELECT * INTO v_asgn
  FROM eca_assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment_not_found'; END IF;

  UPDATE eca_assignments SET status = 'withdrawn' WHERE id = p_assignment_id;

  -- Only an 'assigned' withdrawal frees a seat. Withdrawing a waitlist entry
  -- doesn't open capacity, so there is nothing to promote.
  IF v_asgn.status <> 'assigned' OR v_asgn.activity_id IS NULL THEN
    RETURN jsonb_build_object('school_id', v_asgn.school_id);
  END IF;

  -- Advisory lock on category for waitlist promotion
  PERFORM pg_advisory_xact_lock(hashtext(v_asgn.category_id::text));

  -- Promote oldest waitlisted student in this category whose ranked choices
  -- include the now-vacated activity. Order by the time their FIRST choice
  -- was originally submitted (the canonical FCFS anchor).
  SELECT ea.student_id INTO v_waitlisted
  FROM   eca_assignments ea
  WHERE  ea.category_id = v_asgn.category_id
    AND  ea.status = 'waitlisted'
    AND  EXISTS (
      SELECT 1 FROM eca_choices ec
      WHERE ec.student_id  = ea.student_id
        AND ec.category_id = v_asgn.category_id
        AND ec.activity_id = v_asgn.activity_id
    )
  ORDER  BY (
    SELECT MIN(submitted_at) FROM eca_choices
    WHERE student_id = ea.student_id AND category_id = v_asgn.category_id
  ) ASC
  LIMIT  1;

  IF v_waitlisted IS NOT NULL THEN
    -- Withdraw old waitlist row so the unique partial index allows re-allocation.
    UPDATE eca_assignments
    SET    status = 'withdrawn'
    WHERE  student_id  = v_waitlisted
      AND  category_id = v_asgn.category_id
      AND  status = 'waitlisted';

    PERFORM eca_allocate_student(v_waitlisted, v_asgn.category_id);

    SELECT * INTO v_new_asgn FROM eca_assignments
    WHERE student_id = v_waitlisted AND category_id = v_asgn.category_id AND status = 'assigned'
    ORDER BY assigned_at DESC LIMIT 1;
  END IF;

  IF v_new_asgn.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'school_id',            v_asgn.school_id,
      'promoted_student_id',  v_new_asgn.student_id,
      'promoted_activity_id', v_new_asgn.activity_id
    );
  END IF;

  RETURN jsonb_build_object('school_id', v_asgn.school_id);
END;
$$;

-- ── 5. Overview stats for admin dashboard ─────────────────────
CREATE OR REPLACE FUNCTION eca_overview_stats(
  p_school_id UUID
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_activities',   COUNT(DISTINCT a.id),
    'published_activities', COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'published'),
    'total_choices',      COUNT(DISTINCT ec.id),
    'total_assigned',     COUNT(DISTINCT ea.id) FILTER (WHERE ea.status = 'assigned'),
    'total_waitlisted',   COUNT(DISTINCT ea.id) FILTER (WHERE ea.status = 'waitlisted'),
    'activities', (
      SELECT jsonb_agg(jsonb_build_object(
        'id',          act.id,
        'name',        act.name,
        'category_id', act.category_id,
        'capacity',    act.capacity,
        'assigned',    COALESCE((
          SELECT COUNT(*) FROM eca_assignments
          WHERE activity_id = act.id AND status = 'assigned'
        ), 0),
        'waitlisted',  COALESCE((
          SELECT COUNT(*) FROM eca_assignments
          WHERE activity_id = act.id AND status = 'waitlisted'
        ), 0)
      ))
      FROM eca_activities act
      WHERE act.school_id = p_school_id
        AND act.status IN ('published','closed')
    )
  ) INTO v_result
  FROM eca_activities a
  LEFT JOIN eca_choices ec ON ec.activity_id = a.id
  LEFT JOIN eca_assignments ea ON ea.activity_id = a.id
  WHERE a.school_id = p_school_id;

  RETURN v_result;
END;
$$;
