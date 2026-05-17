-- ============================================================
-- 019_jwt_claims_hook.sql
-- Custom Access Token Hook — populates app_metadata JWT claims
-- Finance auto-record trigger
-- ============================================================
-- IMPORTANT: After applying this migration, enable the hook in
--   Supabase Dashboard → Auth → Hooks → Custom Access Token Hook
--   → Select function: public.custom_access_token_hook
-- ============================================================

-- ── JWT Claims Hook ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_claims    jsonb;
  v_staff_id  uuid;
  v_parent_id uuid;
  v_school_id uuid;
  v_roles     text[];
  v_uid       uuid;
BEGIN
  v_uid    := (event ->> 'user_id')::uuid;
  v_claims := event -> 'claims';

  -- ── Look up staff ──────────────────────────────────────────
  SELECT s.id, s.school_id
    INTO v_staff_id, v_school_id
    FROM staff s
   WHERE s.auth_user_id = v_uid
     AND s.status = 'active'
   LIMIT 1;

  IF v_staff_id IS NOT NULL THEN
    SELECT ARRAY_AGG(sr.role ORDER BY sr.role)
      INTO v_roles
      FROM staff_roles sr
     WHERE sr.staff_id = v_staff_id;

    v_claims := jsonb_set(
      v_claims,
      '{app_metadata}',
      COALESCE(v_claims -> 'app_metadata', '{}'::jsonb) || jsonb_build_object(
        'school_id',   v_school_id::text,
        'staff_id',    v_staff_id::text,
        'parent_id',   NULL,
        'roles',       COALESCE(array_to_json(v_roles)::jsonb, '[]'::jsonb),
        'active_role', COALESCE(v_roles[1], 'hrt')
      )
    );
    RETURN jsonb_set(event, '{claims}', v_claims);
  END IF;

  -- ── Look up parent ─────────────────────────────────────────
  SELECT p.id, p.school_id
    INTO v_parent_id, v_school_id
    FROM parents p
   WHERE p.auth_user_id = v_uid
   LIMIT 1;

  IF v_parent_id IS NOT NULL THEN
    v_claims := jsonb_set(
      v_claims,
      '{app_metadata}',
      COALESCE(v_claims -> 'app_metadata', '{}'::jsonb) || jsonb_build_object(
        'school_id',   v_school_id::text,
        'staff_id',    NULL,
        'parent_id',   v_parent_id::text,
        'roles',       '["parent"]'::jsonb,
        'active_role', 'parent'
      )
    );
    RETURN jsonb_set(event, '{claims}', v_claims);
  END IF;

  -- ── Look up student ─────────────────────────────────────────
  DECLARE
    v_student_id uuid;
  BEGIN
    SELECT s.id, s.school_id
      INTO v_student_id, v_school_id
      FROM students s
     WHERE s.auth_user_id = v_uid
     LIMIT 1;

    IF v_student_id IS NOT NULL THEN
      v_claims := jsonb_set(
        v_claims,
        '{app_metadata}',
        COALESCE(v_claims -> 'app_metadata', '{}'::jsonb) || jsonb_build_object(
          'school_id',   v_school_id::text,
          'staff_id',    NULL,
          'parent_id',   NULL,
          'student_id',  v_student_id::text,
          'roles',       '["student"]'::jsonb,
          'active_role', 'student'
        )
      );
      RETURN jsonb_set(event, '{claims}', v_claims);
    END IF;
  END;

  -- No matching record — return event unmodified
  RETURN event;
END;
$$;

-- Grant to supabase_auth_admin (required for hook execution)
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC, anon, authenticated;

-- ── Finance auto-record trigger ───────────────────────────────
-- Creates a finance_record whenever a StudentYearRecord is inserted,
-- ensuring every student per semester has a finance row from day one.
CREATE OR REPLACE FUNCTION create_finance_record_on_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO finance_records (school_id, student_id, semester_id, status, balance)
  VALUES (NEW.school_id, NEW.student_id, NEW.semester_id, 'unpaid', 0)
  ON CONFLICT (student_id, semester_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_on_enrollment ON student_year_records;
CREATE TRIGGER trg_finance_on_enrollment
AFTER INSERT ON student_year_records
FOR EACH ROW EXECUTE FUNCTION create_finance_record_on_enrollment();

-- ── Active-role priority helper ───────────────────────────────
-- Returns the "most privileged" role for display default.
-- Used by the JWT hook above (v_roles[1] from sorted array gives
-- alphabetical order which puts 'admin' before 'hrt' etc).
-- For explicit priority, override active_role via Supabase dashboard
-- or a role-switcher that triggers a token refresh.
