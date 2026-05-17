-- ============================================================
-- 091_pdf_status_columns.sql
-- Adds the same PDF lifecycle columns (pdf_status, pdf_error,
-- pdf_generated_at) that reports has to invoices, finance_records,
-- and transcripts so every doc type can be tracked through the
-- unified pdf_jobs queue.
--
-- Notes:
--   • invoices already has pdf_url (migration 025) — kept as-is.
--   • finance_records uses receipt_url (migration 033) — also keep,
--     but expose a `pdf_url` alias view via direct column for parity
--     with the unified helper (set by the runner alongside receipt_url).
--   • transcripts already has pdf_url + status; the status column is
--     left alone (legacy 'generating'|'ready'|'failed' values)
--     and a parallel pdf_status column is added to match the
--     queue's 'none|queued|generating|success|failed' vocabulary.
-- ============================================================

-- ── invoices ─────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS pdf_status       TEXT NOT NULL DEFAULT 'none'
    CHECK (pdf_status IN ('none','queued','generating','success','failed')),
  ADD COLUMN IF NOT EXISTS pdf_error        TEXT,
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_pdf_status ON invoices(pdf_status);

-- ── finance_records ──────────────────────────────────────────
ALTER TABLE finance_records
  ADD COLUMN IF NOT EXISTS pdf_url          TEXT,
  ADD COLUMN IF NOT EXISTS pdf_status       TEXT NOT NULL DEFAULT 'none'
    CHECK (pdf_status IN ('none','queued','generating','success','failed')),
  ADD COLUMN IF NOT EXISTS pdf_error        TEXT,
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_finance_records_pdf_status
  ON finance_records(pdf_status);

-- Backfill pdf_url from existing receipt_url so callers can read
-- a single canonical column going forward.
UPDATE finance_records
   SET pdf_url = receipt_url
 WHERE pdf_url IS NULL AND receipt_url IS NOT NULL;

-- ── transcripts ──────────────────────────────────────────────
ALTER TABLE transcripts
  ADD COLUMN IF NOT EXISTS pdf_status       TEXT NOT NULL DEFAULT 'none'
    CHECK (pdf_status IN ('none','queued','generating','success','failed')),
  ADD COLUMN IF NOT EXISTS pdf_error        TEXT,
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_transcripts_pdf_status
  ON transcripts(pdf_status);

-- Backfill: existing transcripts.status='ready' → pdf_status='success'
UPDATE transcripts
   SET pdf_status = CASE status
                      WHEN 'ready'      THEN 'success'
                      WHEN 'failed'     THEN 'failed'
                      WHEN 'generating' THEN 'generating'
                      ELSE 'none'
                    END
 WHERE pdf_status = 'none';
