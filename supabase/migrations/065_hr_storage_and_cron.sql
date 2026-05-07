-- ============================================================
-- 065_hr_storage_and_cron.sql
-- Staff-documents storage bucket + RLS policies
-- Cert-documents storage bucket
-- pg_cron daily schedule for cert-expiry-check edge function
-- ============================================================

-- ── 1. Storage buckets ────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('staff-documents', 'staff-documents', false, 52428800,  -- 50 MB
   ARRAY['application/pdf','image/jpeg','image/png','image/webp',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('cert-documents', 'cert-documents', false, 20971520,  -- 20 MB
   ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ── 2. Storage RLS — staff-documents ──────────────────────────────────────────
-- Authenticated users may only access files under their school_id prefix.
-- Path convention: <school_id>/<staff_id>/<timestamp>_<filename>

DROP POLICY IF EXISTS "staff_docs_select" ON storage.objects;
CREATE POLICY "staff_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND (storage.foldername(name))[1] = (auth.jwt()->'app_metadata'->>'school_id')
  );

DROP POLICY IF EXISTS "staff_docs_insert" ON storage.objects;
CREATE POLICY "staff_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'staff-documents'
    AND (storage.foldername(name))[1] = (auth.jwt()->'app_metadata'->>'school_id')
  );

DROP POLICY IF EXISTS "staff_docs_delete" ON storage.objects;
CREATE POLICY "staff_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND (storage.foldername(name))[1] = (auth.jwt()->'app_metadata'->>'school_id')
  );

-- ── 3. Storage RLS — cert-documents ───────────────────────────────────────────

DROP POLICY IF EXISTS "cert_docs_select" ON storage.objects;
CREATE POLICY "cert_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cert-documents'
    AND (storage.foldername(name))[1] = (auth.jwt()->'app_metadata'->>'school_id')
  );

DROP POLICY IF EXISTS "cert_docs_insert" ON storage.objects;
CREATE POLICY "cert_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cert-documents'
    AND (storage.foldername(name))[1] = (auth.jwt()->'app_metadata'->>'school_id')
  );

DROP POLICY IF EXISTS "cert_docs_delete" ON storage.objects;
CREATE POLICY "cert_docs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'cert-documents'
    AND (storage.foldername(name))[1] = (auth.jwt()->'app_metadata'->>'school_id')
  );

-- ── 4. pg_cron — daily cert-expiry-check invocation ──────────────────────────
-- Requires pg_cron extension (enabled by default on Supabase).
-- Calls the edge function via pg_net (also enabled by default on Supabase).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Wrapper function so cron can call it simply
CREATE OR REPLACE FUNCTION invoke_cert_expiry_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _url     TEXT;
  _key     TEXT;
  _req_id  BIGINT;
BEGIN
  _url := current_setting('app.supabase_url', true) || '/functions/v1/cert-expiry-check';
  _key := current_setting('app.service_role_key', true);

  SELECT net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _key
    ),
    body    := '{}'::jsonb
  ) INTO _req_id;
END;
$$;

-- Schedule: 02:00 UTC daily
SELECT cron.schedule(
  'cert-expiry-daily',
  '0 2 * * *',
  'SELECT invoke_cert_expiry_check()'
) WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cert-expiry-daily'
);
