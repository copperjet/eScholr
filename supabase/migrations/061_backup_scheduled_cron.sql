-- Enable pg_cron for scheduled backups
-- Requires pg_cron extension to be enabled in Supabase dashboard first.
-- The cron job calls the export-school-data edge function for each school
-- that has a non-manual backup schedule.

-- This function is invoked by pg_cron; it uses net.http_post to call the edge function.
CREATE OR REPLACE FUNCTION trigger_scheduled_backups()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  current_dow int := EXTRACT(DOW FROM NOW());  -- 0=Sun, 1=Mon
  current_dom int := EXTRACT(DAY FROM NOW());
BEGIN
  FOR r IN
    SELECT bd.school_id, bd.configured_by
    FROM backup_destinations bd
    WHERE bd.provider = 'google_drive'
      AND bd.access_token_encrypted IS NOT NULL
      AND (
        bd.schedule = 'daily'
        OR (bd.schedule = 'weekly'  AND current_dow = 1)
        OR (bd.schedule = 'monthly' AND current_dom = 1)
      )
  LOOP
    -- Fire-and-forget via pg_net (Supabase HTTP extension)
    PERFORM net.http_post(
      url     := current_setting('app.edge_function_base_url', true) || '/export-school-data',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body    := jsonb_build_object(
        'school_id',    r.school_id,
        'triggered_by', r.configured_by
      )
    );
  END LOOP;
END;
$$;

-- Schedule: run at midnight daily (Supabase cron uses UTC)
-- Uncomment after enabling pg_cron in the Supabase dashboard:
-- SELECT cron.schedule('escholr-backup', '0 0 * * *', 'SELECT trigger_scheduled_backups()');
