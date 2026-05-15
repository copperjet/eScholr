-- ============================================================
-- 093_transcript_v2.sql
-- Phase 3 of the production-ready PDF rollout.
--
--   1. Feature flag column on schools (canary the new pipeline).
--   2. create_and_enqueue_transcript RPC — inserts the transcripts
--      row and queues a pdf_jobs entry atomically. UI calls one RPC,
--      gets a transcript_id, polls pdf_jobs / pdf_versions.
-- ============================================================

-- ── 1. Canary feature flag ────────────────────────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS feature_pdf_v2_transcripts BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN schools.feature_pdf_v2_transcripts IS
  'When true, transcripts render via the unified pdf-lib pipeline. When false, the legacy generate-transcript HTML/Puppeteer path is used.';

-- ── 2. Atomic create-and-enqueue RPC ──────────────────────────
-- Returns the new transcript row's id. Caller then polls
-- pdf_jobs(doc_type='transcript', doc_id=<id>) and pdf_versions
-- via the usePdfStatus hook.
CREATE OR REPLACE FUNCTION create_and_enqueue_transcript(
  p_student_id        UUID,
  p_academic_year_ids UUID[]
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_school_id     UUID;
  v_caller_staff  UUID;
  v_transcript_id UUID;
BEGIN
  IF NOT user_has_role(ARRAY['super_admin','admin','school_super_admin','principal','coordinator']) THEN
    RAISE EXCEPTION 'permission denied for transcript creation';
  END IF;

  SELECT school_id INTO v_school_id FROM students WHERE id = p_student_id;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'student % not found', p_student_id;
  END IF;

  IF v_school_id <> current_school_id() THEN
    RAISE EXCEPTION 'cross-school access denied';
  END IF;

  IF p_academic_year_ids IS NULL OR array_length(p_academic_year_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'academic_year_ids must be non-empty';
  END IF;

  v_caller_staff := current_staff_id();

  INSERT INTO transcripts (
    school_id, student_id, academic_year_ids, generated_by,
    status, pdf_status, generated_at
  )
  VALUES (
    v_school_id, p_student_id, p_academic_year_ids, v_caller_staff,
    'generating', 'queued', now()
  )
  RETURNING id INTO v_transcript_id;

  -- Reuse the unified enqueue path so the runner picks it up.
  PERFORM enqueue_pdf('transcript', v_transcript_id, 5, false, '{}'::jsonb);

  RETURN v_transcript_id;
END;
$$;

REVOKE ALL ON FUNCTION create_and_enqueue_transcript(UUID, UUID[]) FROM public;
GRANT EXECUTE ON FUNCTION create_and_enqueue_transcript(UUID, UUID[]) TO authenticated;
