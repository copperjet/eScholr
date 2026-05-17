-- ─────────────────────────────────────────────────────────────────────────────
-- 032_platform_admin.sql
-- Platform Super-Admin support tables
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Platform impersonation log ────────────────────────────────────────────
-- Every time super_admin impersonates a school admin, log it here.
CREATE TABLE IF NOT EXISTS platform_impersonation_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  impersonated_by  UUID NOT NULL,              -- super_admin auth.users.id
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  target_staff_id  UUID,                       -- staff being impersonated (NULL = generic admin)
  target_email     TEXT NOT NULL,
  reason           TEXT,                       -- optional note
  session_token    TEXT,                       -- short-lived token (informational)
  expires_at       TIMESTAMPTZ,
  revoked          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_impersonation_log ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read/write this table (via service role in edge fns)
CREATE POLICY "super_admin_only_impersonation" ON platform_impersonation_log
  USING (FALSE); -- block all direct client access; only edge functions (service role) touch this

-- ── 2. School notes ───────────────────────────────────────────────────────────
-- Platform admin can attach internal notes to a school (billing notes, support, etc.)
CREATE TABLE IF NOT EXISTS school_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL,   -- super_admin auth.users.id
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  is_pinned    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE school_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_only_notes" ON school_notes
  USING (FALSE); -- edge function only

-- ── 3. Plan limits reference ──────────────────────────────────────────────────
-- Declarative plan caps — used by edge fns to enforce limits
CREATE TABLE IF NOT EXISTS platform_plans (
  plan               TEXT PRIMARY KEY,
  max_students       INT NOT NULL DEFAULT 200,
  max_staff          INT NOT NULL DEFAULT 20,
  price_usd_monthly  NUMERIC(10,2) NOT NULL DEFAULT 0,
  features           JSONB NOT NULL DEFAULT '{}'
);

INSERT INTO platform_plans (plan, max_students, max_staff, price_usd_monthly, features) VALUES
  ('starter',    200,  20,   49.00,  '{"reports":true,"daybook":true,"finance":false,"api":false}'),
  ('growth',     500,  50,  149.00,  '{"reports":true,"daybook":true,"finance":true,"api":false}'),
  ('scale',     2000, 200,  399.00,  '{"reports":true,"daybook":true,"finance":true,"api":true}'),
  ('enterprise',   0,   0,  999.00,  '{"reports":true,"daybook":true,"finance":true,"api":true,"whitelabel":true}')
ON CONFLICT (plan) DO NOTHING;

-- ── 4. Helper function: count_super_admins (used by create-platform-admin) ───
CREATE OR REPLACE FUNCTION count_super_admins()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::int
  FROM auth.users
  WHERE (raw_app_meta_data ->> 'roles')::jsonb ? 'super_admin';
$$;

-- Grant execute to authenticated (edge fn uses service role anyway)
GRANT EXECUTE ON FUNCTION count_super_admins() TO authenticated;

-- ── 5. Subscription renewal_date column on schools (if not already present) ──
ALTER TABLE schools ADD COLUMN IF NOT EXISTS renewal_date DATE;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS notes_count  INT NOT NULL DEFAULT 0;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS max_students INT;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── 6. Trigger: keep schools.notes_count in sync ─────────────────────────────
CREATE OR REPLACE FUNCTION increment_school_notes_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE schools SET notes_count = notes_count + 1 WHERE id = NEW.school_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_school_notes_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE schools SET notes_count = GREATEST(notes_count - 1, 0) WHERE id = OLD.school_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_notes_count_inc ON school_notes;
CREATE TRIGGER trg_notes_count_inc
  AFTER INSERT ON school_notes
  FOR EACH ROW EXECUTE FUNCTION increment_school_notes_count();

DROP TRIGGER IF EXISTS trg_notes_count_dec ON school_notes;
CREATE TRIGGER trg_notes_count_dec
  AFTER DELETE ON school_notes
  FOR EACH ROW EXECUTE FUNCTION decrement_school_notes_count();
