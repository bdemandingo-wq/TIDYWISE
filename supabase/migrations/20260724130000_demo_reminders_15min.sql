-- demo-reminders now runs every 15 minutes so the sub-hour reminder windows
-- (1h admin, 30min client) can't fall between runs. Replaces the hourly job
-- scheduled in 20260723021110.

DO $$ BEGIN
  PERFORM cron.unschedule('demo-reminders-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  PERFORM cron.unschedule('demo-reminders-15min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'demo-reminders-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/demo-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key'),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{"time":"15min"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
