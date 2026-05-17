-- Add documents JSONB and reference_no columns
ALTER TABLE admissions_applications ADD COLUMN documents jsonb DEFAULT '{}';
ALTER TABLE admissions_applications ADD COLUMN reference_no text UNIQUE;

-- Create sequence for reference numbers
CREATE SEQUENCE admissions_app_seq AS bigint START WITH 1;

-- Trigger function to generate reference numbers
CREATE OR REPLACE FUNCTION gen_admissions_reference_no()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reference_no IS NULL THEN
    NEW.reference_no := 'APP-' || EXTRACT(YEAR FROM now())::text || '-' ||
                       LPAD(nextval('admissions_app_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for reference_no generation
CREATE TRIGGER admissions_gen_reference_no
BEFORE INSERT ON admissions_applications
FOR EACH ROW
EXECUTE FUNCTION gen_admissions_reference_no();

-- Backfill documents from legacy documents_url (if column exists)
-- This is a no-op if documents_url doesn't exist, which is fine
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admissions_applications' AND column_name = 'documents_url'
  ) THEN
    UPDATE admissions_applications
    SET documents = jsonb_build_object('prev_school_report', jsonb_build_object('path', documents_url))
    WHERE documents_url IS NOT NULL AND documents = '{}';
  END IF;
END $$;
