-- ============================================================
-- 068_admissions_storage_bucket.sql
-- Private storage bucket for admissions documents.
-- Public form uploads to /pending/<sessionId>/...
-- Staff manage docs scoped by application's school_id (via JWT).
-- ============================================================

INSERT INTO storage.buckets (id, name, public, created_at, updated_at, file_size_limit)
VALUES ('admissions-documents', 'admissions-documents', false, now(), now(), 52428800)
ON CONFLICT (id) DO NOTHING;

-- ── Anon: insert into /pending only ──────────────────────────
DROP POLICY IF EXISTS "anon_insert_pending" ON storage.objects;
CREATE POLICY "anon_insert_pending" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'admissions-documents'
    AND (storage.foldername(name))[1] = 'pending'
  );

-- ── Staff: full access to docs for applications in their school ─
-- The first folder segment is the application id. Look it up and
-- match its school_id to the caller's JWT school_id. RLS on
-- admissions_applications (035: staff_manage_applications) already
-- restricts which rows the caller can see, so no role check needed.
DROP POLICY IF EXISTS "staff_manage_app_docs" ON storage.objects;
CREATE POLICY "staff_manage_app_docs" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'admissions-documents'
    AND EXISTS (
      SELECT 1
        FROM admissions_applications a
       WHERE a.id::text = (storage.foldername(name))[1]
         AND a.school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    )
  )
  WITH CHECK (
    bucket_id = 'admissions-documents'
    AND EXISTS (
      SELECT 1
        FROM admissions_applications a
       WHERE a.id::text = (storage.foldername(name))[1]
         AND a.school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    )
  );

-- ── Staff: read pending uploads (so they can preview before
-- a row exists in admissions_applications, and so the
-- application-detail viewer can render documents whose paths
-- still live under /pending/...) ─────────────────────────────
DROP POLICY IF EXISTS "staff_read_pending" ON storage.objects;
CREATE POLICY "staff_read_pending" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'admissions-documents'
    AND (storage.foldername(name))[1] = 'pending'
    AND (auth.jwt()->'app_metadata'->>'school_id') IS NOT NULL
  );
