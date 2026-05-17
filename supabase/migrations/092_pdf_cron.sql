-- ============================================================
-- 092_pdf_cron.sql
-- Registers the cron entry that drains the unified pdf_jobs queue.
-- The legacy 'report-pdf-runner' job stays scheduled for now — it
-- targets report_pdf_jobs (different table). It will be unscheduled
-- in a later migration once Phase 4 cuts report cards over to the
-- unified queue.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    -- Idempotent: remove prior registration so the body can change.
    PERFORM cron.unschedule('pdf-job-runner')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pdf-job-runner');

    PERFORM cron.schedule(
      'pdf-job-runner',
      '* * * * *',
      $cron$
        SELECT extensions.http_post(
          url     := current_setting('app.settings.supabase_url', true)
                     || '/functions/v1/pdf-job-runner',
          body    := '{}',
          headers := json_build_object(
                       'Content-Type',  'application/json',
                       'Authorization',
                       'Bearer ' || current_setting('app.settings.service_role_key', true)
                     )::jsonb,
          timeout_milliseconds := 25000
        );
      $cron$
    );
  END IF;
END $$;
