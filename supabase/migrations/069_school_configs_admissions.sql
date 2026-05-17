-- Add admissions configuration columns to schools
ALTER TABLE schools
ADD COLUMN IF NOT EXISTS admissions_required_docs text[] DEFAULT '{"birth_cert"}',
ADD COLUMN IF NOT EXISTS public_admissions_documents_max_mb integer DEFAULT 10;

-- Create index for config lookups
CREATE INDEX IF NOT EXISTS idx_schools_admissions_config ON schools(id);
