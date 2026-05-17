-- ─────────────────────────────────────────────────────────────────────────────
-- 021_announcements.sql
-- Announcements module: compose, target, deliver, track reads.
-- ─────────────────────────────────────────────────────────────────────────────

-- Audience targeting type
CREATE TYPE announcement_audience AS ENUM ('school', 'grade', 'stream', 'role');

-- Core announcements table
CREATE TABLE IF NOT EXISTS announcements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author_id         uuid NOT NULL,  -- auth.users.id of composer
  title             text NOT NULL,
  body              text NOT NULL,
  audience_type     announcement_audience NOT NULL DEFAULT 'school',
  audience_grade_id uuid REFERENCES grades(id) ON DELETE SET NULL,
  audience_stream_id uuid REFERENCES streams(id) ON DELETE SET NULL,
  audience_role     text,           -- e.g. 'hrt', 'parent', 'st'
  attachment_url    text,
  is_pinned         boolean NOT NULL DEFAULT false,
  published_at      timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Per-user read receipts
CREATE TABLE IF NOT EXISTS announcement_reads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  read_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_announcements_school     ON announcements(school_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user  ON announcement_reads(user_id, announcement_id);

-- RLS
ALTER TABLE announcements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_reads    ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user in the same school can read announcements
CREATE POLICY "announcements_read" ON announcements
  FOR SELECT USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
  );

-- Write: admin, principal, coordinator only
CREATE POLICY "announcements_insert" ON announcements
  FOR INSERT WITH CHECK (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| ARRAY['admin','principal','coordinator','super_admin']
  );

CREATE POLICY "announcements_delete" ON announcements
  FOR DELETE USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| ARRAY['admin','principal','coordinator','super_admin']
  );

-- Reads: own rows only
CREATE POLICY "announcement_reads_select" ON announcement_reads
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "announcement_reads_insert" ON announcement_reads
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- search helper for announcements (used by admin feed)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_announcements(p_school_id uuid, p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid, title text, body text, audience_type announcement_audience,
  is_pinned boolean, published_at timestamptz, expires_at timestamptz,
  author_name text, audience_label text, attachment_url text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    a.id, a.title, a.body, a.audience_type,
    a.is_pinned, a.published_at, a.expires_at,
    COALESCE(s.full_name, 'System') AS author_name,
    CASE a.audience_type
      WHEN 'grade'  THEN COALESCE('Grade: ' || g.name, 'Grade')
      WHEN 'stream' THEN COALESCE('Stream: ' || st.name, 'Stream')
      WHEN 'role'   THEN COALESCE('Role: ' || a.audience_role, 'Role')
      ELSE 'Whole School'
    END AS audience_label,
    a.attachment_url
  FROM announcements a
  LEFT JOIN staff s ON s.auth_user_id = a.author_id AND s.school_id = a.school_id
  LEFT JOIN grades g ON g.id = a.audience_grade_id
  LEFT JOIN streams st ON st.id = a.audience_stream_id
  WHERE a.school_id = p_school_id
    AND (a.expires_at IS NULL OR a.expires_at > now())
  ORDER BY a.is_pinned DESC, a.published_at DESC
  LIMIT p_limit;
$$;
