-- ============================================================
-- 090_unified_pdf_jobs.sql
-- Phase 0 of the production-ready PDF rollout.
--
-- Introduces a single queue + versioning layer for every document
-- type (report card, invoice, receipt, transcript). The existing
-- report_pdf_jobs + report_versions tables are kept for backward
-- compatibility for one release; data is backfilled into the
-- unified tables.
--
--   1. pdf_jobs                 — unified work queue
--   2. pdf_versions             — immutable per-document snapshots
--   3. enqueue_pdf RPC          — idempotent, role-gated insert
--   4. trg_pdf_versions_current — auto-flip is_current
--   5. Backfill from report_pdf_jobs + report_versions
-- ============================================================

-- ── 1. Unified job queue ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS pdf_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  doc_type     TEXT NOT NULL
    CHECK (doc_type IN ('report','invoice','receipt','transcript')),
  doc_id       UUID NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','success','failed')),
  priority     INTEGER NOT NULL DEFAULT 5,
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error   TEXT,
  is_preview   BOOLEAN NOT NULL DEFAULT false,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);

-- One active job per (doc_type, doc_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_jobs_one_active
  ON pdf_jobs(doc_type, doc_id)
  WHERE status IN ('queued','running');

CREATE INDEX IF NOT EXISTS idx_pdf_jobs_status
  ON pdf_jobs(status, priority ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_pdf_jobs_doc
  ON pdf_jobs(doc_type, doc_id);

ALTER TABLE pdf_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pdf_jobs_select" ON pdf_jobs;
CREATE POLICY "pdf_jobs_select" ON pdf_jobs FOR SELECT TO authenticated
  USING (
    school_id = current_school_id()
    AND user_has_role(ARRAY[
      'super_admin','admin','principal','coordinator','hod','hrt','finance'
    ])
  );

-- No client INSERT/UPDATE/DELETE policy. Enqueue happens through
-- the SECURITY DEFINER RPC; the runner uses the service role.

-- ── 2. Unified version table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS pdf_versions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  doc_type           TEXT NOT NULL
    CHECK (doc_type IN ('report','invoice','receipt','transcript')),
  doc_id             UUID NOT NULL,
  version_number     INTEGER NOT NULL,
  pdf_url            TEXT NOT NULL,
  verification_token CHAR(16),  -- nullable; only set for reports
  is_current         BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doc_type, doc_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_versions_token
  ON pdf_versions(verification_token)
  WHERE verification_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pdf_versions_one_current
  ON pdf_versions(doc_type, doc_id)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_pdf_versions_doc
  ON pdf_versions(doc_type, doc_id, version_number DESC);

ALTER TABLE pdf_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pdf_versions_select" ON pdf_versions;
CREATE POLICY "pdf_versions_select" ON pdf_versions FOR SELECT TO authenticated
  USING (school_id = current_school_id());

-- Immutable from client side — inserts/updates via service role only.

-- ── 3. Auto-flip is_current on new version ────────────────────
CREATE OR REPLACE FUNCTION trg_pdf_versions_set_current()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE pdf_versions
       SET is_current = false
     WHERE doc_type = NEW.doc_type
       AND doc_id   = NEW.doc_id
       AND id <> NEW.id
       AND is_current = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pdf_versions_current ON pdf_versions;
CREATE TRIGGER trg_pdf_versions_current
  AFTER INSERT OR UPDATE OF is_current ON pdf_versions
  FOR EACH ROW EXECUTE FUNCTION trg_pdf_versions_set_current();

-- ── 4. enqueue_pdf RPC ────────────────────────────────────────
-- Resolves school_id from the target document. Role-gates by doc_type.
-- Idempotent: reuses queued/running row if any.
CREATE OR REPLACE FUNCTION enqueue_pdf(
  p_doc_type   TEXT,
  p_doc_id     UUID,
  p_priority   INTEGER DEFAULT 5,
  p_is_preview BOOLEAN DEFAULT false,
  p_payload    JSONB   DEFAULT '{}'::jsonb
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_school_id UUID;
  v_existing  UUID;
  v_new_id    UUID;
BEGIN
  -- Role gate
  IF p_doc_type = 'report' THEN
    IF NOT user_has_role(ARRAY['super_admin','admin','principal','hrt']) THEN
      RAISE EXCEPTION 'permission denied for report PDF';
    END IF;
    SELECT school_id INTO v_school_id FROM reports WHERE id = p_doc_id;
  ELSIF p_doc_type = 'invoice' THEN
    IF NOT user_has_role(ARRAY['super_admin','admin','school_super_admin','finance']) THEN
      RAISE EXCEPTION 'permission denied for invoice PDF';
    END IF;
    SELECT school_id INTO v_school_id FROM invoices WHERE id = p_doc_id;
  ELSIF p_doc_type = 'receipt' THEN
    IF NOT user_has_role(ARRAY['super_admin','admin','school_super_admin','finance']) THEN
      RAISE EXCEPTION 'permission denied for receipt PDF';
    END IF;
    SELECT school_id INTO v_school_id FROM finance_records WHERE id = p_doc_id;
  ELSIF p_doc_type = 'transcript' THEN
    IF NOT user_has_role(ARRAY['super_admin','admin','school_super_admin','principal','coordinator']) THEN
      RAISE EXCEPTION 'permission denied for transcript PDF';
    END IF;
    SELECT school_id INTO v_school_id FROM transcripts WHERE id = p_doc_id;
  ELSE
    RAISE EXCEPTION 'unknown doc_type: %', p_doc_type;
  END IF;

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION '% % not found', p_doc_type, p_doc_id;
  END IF;

  IF v_school_id <> current_school_id() THEN
    RAISE EXCEPTION 'cross-school access denied';
  END IF;

  -- Reuse active job
  SELECT id INTO v_existing
  FROM   pdf_jobs
  WHERE  doc_type = p_doc_type
    AND  doc_id   = p_doc_id
    AND  status IN ('queued','running');

  IF v_existing IS NOT NULL THEN
    UPDATE pdf_jobs
       SET priority   = LEAST(priority, p_priority),
           is_preview = p_is_preview,
           payload    = p_payload
     WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO pdf_jobs (school_id, doc_type, doc_id, priority, is_preview, payload)
  VALUES (v_school_id, p_doc_type, p_doc_id, p_priority, p_is_preview, p_payload)
  RETURNING id INTO v_new_id;

  -- Mirror queued status onto parent table where applicable
  IF p_doc_type = 'report' THEN
    UPDATE reports
       SET pdf_status = 'queued', pdf_error = NULL, updated_at = now()
     WHERE id = p_doc_id;
  ELSIF p_doc_type = 'invoice' THEN
    UPDATE invoices
       SET pdf_status = 'queued', pdf_error = NULL
     WHERE id = p_doc_id;
  ELSIF p_doc_type = 'receipt' THEN
    UPDATE finance_records
       SET pdf_status = 'queued', pdf_error = NULL
     WHERE id = p_doc_id;
  ELSIF p_doc_type = 'transcript' THEN
    UPDATE transcripts
       SET pdf_status = 'queued', pdf_error = NULL
     WHERE id = p_doc_id;
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION enqueue_pdf(TEXT, UUID, INTEGER, BOOLEAN, JSONB) FROM public;
GRANT EXECUTE ON FUNCTION enqueue_pdf(TEXT, UUID, INTEGER, BOOLEAN, JSONB) TO authenticated;

-- ── 5. Backfill from legacy report tables ─────────────────────
-- Copy report_pdf_jobs → pdf_jobs (idempotent on (doc_type, doc_id) where active)
INSERT INTO pdf_jobs (
  id, school_id, doc_type, doc_id, status, priority, attempts,
  last_error, is_preview, created_at, started_at, finished_at
)
SELECT
  rpj.id, rpj.school_id, 'report', rpj.report_id, rpj.status,
  rpj.priority, rpj.attempts, rpj.last_error, rpj.is_preview,
  rpj.created_at, rpj.started_at, rpj.finished_at
FROM report_pdf_jobs rpj
ON CONFLICT (id) DO NOTHING;

-- Copy report_versions → pdf_versions
INSERT INTO pdf_versions (
  id, school_id, doc_type, doc_id, version_number, pdf_url,
  verification_token, is_current, created_at
)
SELECT
  rv.id, rv.school_id, 'report', rv.report_id, rv.version_number,
  rv.pdf_url, rv.verification_token, rv.is_current, rv.created_at
FROM report_versions rv
WHERE rv.pdf_url IS NOT NULL
ON CONFLICT (id) DO NOTHING;
