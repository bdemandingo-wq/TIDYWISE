SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/weekly-business-report',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
  ),
  body := '{}'::jsonb
);