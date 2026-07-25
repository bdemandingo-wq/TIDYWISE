-- Wire the weekly_summary automation. weekly-business-report already filters to
-- orgs whose weekly_summary toggle is on and fans out over them; it just had no
-- scheduler, so the toggle did nothing. Run it every Monday morning.

DO $$ BEGIN
  PERFORM cron.unschedule('weekly-business-report-monday');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'weekly-business-report-monday',
  '0 13 * * 1',  -- Mondays 13:00 UTC (~8-9am ET)
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/weekly-business-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key'),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
