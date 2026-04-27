-- ============================================================
-- 034_fix_jwt_hook.sql
-- Fix custom_access_token_hook: remove nested DECLARE block,
-- add EXCEPTION handler so the hook never blocks login.
-- ============================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_claims      jsonb;
  v_staff_id    uuid;
  v_parent_id   uuid;
  v_student_id  uuid;
  v_school_id   uuid;
  v_roles       text[];
  v_uid         uuid;
  v_has_student_auth boolean;
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
        'parent_id',   NULL::text,
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
        'staff_id',    NULL::text,
        'parent_id',   v_parent_id::text,
        'roles',       '["parent"]'::jsonb,
        'active_role', 'parent'
      )
    );
    RETURN jsonb_set(event, '{claims}', v_claims);
  END IF;

  -- ── Look up student (only if column exists) ────────────────
  -- auth_user_id was added in migration 024; guard against it missing
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'students'
       AND column_name  = 'auth_user_id'
  ) INTO v_has_student_auth;

  IF v_has_student_auth THEN
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
          'staff_id',    NULL::text,
          'parent_id',   NULL::text,
          'student_id',  v_student_id::text,
          'roles',       '["student"]'::jsonb,
          'active_role', 'student'
        )
      );
      RETURN jsonb_set(event, '{claims}', v_claims);
    END IF;
  END IF;

  -- No matching record — return event unmodified (e.g. super_admin)
  RETURN event;

EXCEPTION WHEN OTHERS THEN
  -- Never block login; return unmodified event if anything goes wrong
  RAISE WARNING 'custom_access_token_hook error: % %', SQLERRM, SQLSTATE;
  RETURN event;
END;
$$;

-- Re-grant permissions (idempotent)
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC, anon, authenticated;
