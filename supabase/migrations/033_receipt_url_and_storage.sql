-- ============================================================
-- 033_receipt_url_and_storage.sql
-- ============================================================

-- Add receipt_url column to finance_records
ALTER TABLE finance_records
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Create receipts storage bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  true,
  10485760,  -- 10 MB
  ARRAY['application/pdf', 'text/html']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: school members can read; service role / finance staff can upload
CREATE POLICY "receipts_read_school"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[2] = (auth.jwt() -> 'app_metadata' ->> 'school_id')
  );

CREATE POLICY "receipts_write_finance"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (auth.jwt() -> 'app_metadata' -> 'roles') ? 'finance'
  );

-- Allow service role (edge functions) to bypass RLS for uploads
CREATE POLICY "receipts_service_role_all"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'receipts')
  WITH CHECK (bucket_id = 'receipts');
