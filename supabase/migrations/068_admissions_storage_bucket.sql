-- Create private storage bucket for admissions documents
INSERT INTO storage.buckets (id, name, public, created_at, updated_at, file_size_limit)
VALUES ('admissions-documents', 'admissions-documents', false, now(), now(), 52428800)
ON CONFLICT (id) DO NOTHING;

-- Allow anon to INSERT into pending folder (for public form uploads)
CREATE POLICY "anon_insert_pending" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'admissions-documents'
    AND (storage.foldername(name))[1] = 'pending'
  );

-- Allow staff (admin, school_admin, front_desk) to SELECT/INSERT/DELETE within application folder
CREATE POLICY "staff_manage_app_docs" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'admissions-documents'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM admissions_applications
      WHERE id::text = (storage.foldername(name))[1]
      AND school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'school_admin', 'front_desk')
      )
    )
  )
  WITH CHECK (
    bucket_id = 'admissions-documents'
    AND (storage.foldername(name))[1] = (
      SELECT id::text FROM admissions_applications
      WHERE id::text = (storage.foldername(name))[1]
      AND school_id IN (
        SELECT school_id FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'school_admin', 'front_desk')
      )
    )
  );
