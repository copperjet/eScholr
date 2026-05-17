-- ============================================================
-- 080_timetable_job_queue.sql — R3.5
-- Register pg_cron job to pick up queued timetable generation
-- runs every minute, invoking the timetable-job-runner edge fn.
-- ============================================================

-- Enable pg_cron (idempotent; already available on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Remove any prior registration (idempotent)
SELECT cron.unschedule('timetable-job-runner')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'timetable-job-runner'
);

-- Register: every minute, call the job-runner edge function.
-- Requires app.settings.supabase_url + app.settings.service_role_key
-- to be set via `ALTER DATABASE ... SET app.settings.* = '...'`
-- (done by Supabase for projects that have those vault entries).
SELECT cron.schedule(
  'timetable-job-runner',
  '* * * * *',
  $$
    SELECT extensions.http_post(
      url     := current_setting('app.settings.supabase_url', true)
                 || '/functions/v1/timetable-job-runner',
      body    := '{}',
      headers := json_build_object(
                   'Content-Type',  'application/json',
                   'Authorization',
                   'Bearer ' || current_setting('app.settings.service_role_key', true)
                 )::jsonb,
      timeout_milliseconds := 8000
    );
  $$
);
