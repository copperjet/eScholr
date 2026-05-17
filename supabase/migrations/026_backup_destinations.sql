-- ============================================================
-- 026_backup_destinations.sql
-- School data backup to external storage (Google Drive)
-- ============================================================

CREATE TABLE IF NOT EXISTS backup_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive')),
  -- OAuth tokens encrypted at rest
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  -- Drive folder where backups stored
  folder_id TEXT,
  folder_name TEXT,
  -- Backup schedule
  schedule TEXT NOT NULL DEFAULT 'manual' CHECK (schedule IN ('manual','daily','weekly','monthly')),
  last_backup_at TIMESTAMPTZ,
  last_backup_status TEXT CHECK (last_backup_status IN ('success','failed','in_progress')),
  last_backup_error TEXT,
  last_backup_file_id TEXT, -- Google Drive file ID
  -- Who configured this
  configured_by UUID REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, provider)
);

-- Backup audit log
CREATE TABLE IF NOT EXISTS backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  destination_id UUID REFERENCES backup_destinations(id),
  triggered_by UUID REFERENCES staff(id), -- null = scheduled
  status TEXT NOT NULL CHECK (status IN ('started','success','failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  file_size_bytes BIGINT,
  file_id TEXT,
  file_name TEXT,
  error_message TEXT,
  tables_included TEXT[], -- ['students','staff','marks',...]
  record_counts JSONB -- {table: count}
);

-- RLS
ALTER TABLE backup_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS si_backup_destinations ON backup_destinations;
CREATE POLICY si_backup_destinations ON backup_destinations FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

DROP POLICY IF EXISTS si_backup_logs ON backup_logs;
CREATE POLICY si_backup_logs ON backup_logs FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_backup_dest_school ON backup_destinations(school_id);
CREATE INDEX IF NOT EXISTS idx_backup_logs_school ON backup_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_backup_logs_status ON backup_logs(status);

-- Update trigger
CREATE OR REPLACE FUNCTION update_backup_destinations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_backup_destinations_updated ON backup_destinations;
CREATE TRIGGER trg_backup_destinations_updated
  BEFORE UPDATE ON backup_destinations
  FOR EACH ROW EXECUTE FUNCTION update_backup_destinations_updated_at();

-- Add backup_admin_staff_id to school_configs for access control
-- This is handled via app logic checking staff_id against config
