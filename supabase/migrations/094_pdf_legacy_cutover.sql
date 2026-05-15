-- ============================================================
-- 094_pdf_legacy_cutover.sql
-- Phase 4 cleanup. After this migration the unified pdf_jobs +
-- pdf-job-runner pipeline is the sole entry point for report
-- PDF generation.
--
--   1. Unschedule legacy report-pdf-runner cron.
--   2. Redirect enqueue_report_pdf() RPC to enqueue_pdf() — keeps
--      old client builds working until they refresh.
-- ============================================================

-- ── 1. Drop legacy cron registration ─────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('report-pdf-runner')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'report-pdf-runner');
  END IF;
END $$;

-- ── 2. Backward-compat shim ──────────────────────────────────
-- Older client builds still call enqueue_report_pdf. Rewire it to
-- forward into the unified queue so we can deploy DB + functions
-- before every client has shipped.
CREATE OR REPLACE FUNCTION enqueue_report_pdf(
  p_report_id  UUID,
  p_is_preview BOOLEAN DEFAULT false,
  p_priority   INTEGER DEFAULT 5
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN enqueue_pdf('report', p_report_id, p_priority, p_is_preview, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION enqueue_report_pdf(UUID, BOOLEAN, INTEGER) FROM public;
GRANT EXECUTE ON FUNCTION enqueue_report_pdf(UUID, BOOLEAN, INTEGER) TO authenticated;

-- Note: report_pdf_jobs and report_versions tables remain in place
-- as read-only history for one release cycle. They are no longer
-- written to. A future migration can DROP them once analytics or
-- audit tooling has caught up.
