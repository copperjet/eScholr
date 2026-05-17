-- ============================================================
-- 083_sage_sync_outbox.sql
-- Sage sync outbox — one-way push queue for finance + payroll.
-- Outbox pattern: every finance event enqueues a row here.
-- Edge fns drain queue → CSV bundle or Sage API journal.
-- ============================================================

-- ── 1. sage_sync_queue (finance events) ──────────────────────
CREATE TABLE IF NOT EXISTS sage_sync_queue (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL,
  -- e.g. 'invoice_created','payment_recorded','invoice_cancelled'
  entity_table     TEXT NOT NULL,
  entity_id        UUID NOT NULL,
  payload          JSONB NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent_csv','sent_api','failed','skipped')),
  attempts         INT NOT NULL DEFAULT 0,
  last_error       TEXT,
  idempotency_key  TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ,
  UNIQUE (idempotency_key)
);

ALTER TABLE sage_sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_sage_sync ON sage_sync_queue FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_ssq_school_status ON sage_sync_queue(school_id, status);
CREATE INDEX IF NOT EXISTS idx_ssq_entity        ON sage_sync_queue(entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_ssq_created       ON sage_sync_queue(created_at);

-- ── 2. sage_payroll_sync_queue (payroll events) ───────────────
CREATE TABLE IF NOT EXISTS sage_payroll_sync_queue (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL,
  entity_table     TEXT NOT NULL,
  entity_id        UUID NOT NULL,
  payload          JSONB NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent_csv','sent_api','failed','skipped')),
  attempts         INT NOT NULL DEFAULT 0,
  last_error       TEXT,
  idempotency_key  TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ,
  UNIQUE (idempotency_key)
);

ALTER TABLE sage_payroll_sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_sage_payroll_sync ON sage_payroll_sync_queue FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_spsq_school_status ON sage_payroll_sync_queue(school_id, status);

-- ── 3. finance_exports (log of CSV bundles sent) ─────────────
CREATE TABLE IF NOT EXISTS finance_exports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  export_type      TEXT NOT NULL DEFAULT 'csv'
    CHECK (export_type IN ('csv','api')),
  file_url         TEXT,
  rows_included    INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success','partial','failed')),
  error_message    TEXT,
  created_by       UUID REFERENCES staff(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finance_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY si_finance_exports ON finance_exports FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_fe_school ON finance_exports(school_id, created_at DESC);

-- ── 4. DB trigger: enqueue on invoice INSERT ──────────────────
CREATE OR REPLACE FUNCTION enqueue_invoice_sage_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sage_sync_queue (
    school_id, event_type, entity_table, entity_id, payload, idempotency_key
  ) VALUES (
    NEW.school_id,
    'invoice_created',
    'invoices',
    NEW.id,
    jsonb_build_object(
      'invoice_number', NEW.invoice_number,
      'student_id',     NEW.student_id,
      'semester_id',    NEW.semester_id,
      'total_amount',   NEW.total_amount,
      'issue_date',     NEW.issue_date,
      'status',         NEW.status
    ),
    NEW.school_id::text || ':invoices:' || NEW.id::text || ':invoice_created'
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_sage_enqueue ON invoices;
CREATE TRIGGER trg_invoice_sage_enqueue
  AFTER INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION enqueue_invoice_sage_event();

-- ── 5. DB trigger: enqueue on payment_transactions INSERT ─────
CREATE OR REPLACE FUNCTION enqueue_payment_sage_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sage_sync_queue (
    school_id, event_type, entity_table, entity_id, payload, idempotency_key
  ) VALUES (
    NEW.school_id,
    'payment_recorded',
    'payment_transactions',
    NEW.id,
    jsonb_build_object(
      'finance_record_id',   NEW.finance_record_id,
      'invoice_id',          NEW.invoice_id,
      'student_id',          NEW.student_id,
      'semester_id',         NEW.semester_id,
      'amount',              NEW.amount,
      'payment_method_code', NEW.payment_method_code,
      'reference_number',    NEW.reference_number,
      'paid_at',             NEW.paid_at
    ),
    NEW.school_id::text || ':payment_transactions:' || NEW.id::text || ':payment_recorded'
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_sage_enqueue ON payment_transactions;
CREATE TRIGGER trg_payment_sage_enqueue
  AFTER INSERT ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION enqueue_payment_sage_event();

-- ── 6. Module config defaults ─────────────────────────────────
-- Add Sage-related config keys to school_configs check constraint.
-- Extend notification_logs trigger_event if needed (no finance events there).
-- school_configs is text-based key/value, no constraint to update.
