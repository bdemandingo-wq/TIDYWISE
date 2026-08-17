select cron.unschedule('broadcast-dispatch-1min')
where exists (select 1 from cron.job where jobname = 'broadcast-dispatch-1min');

select cron.schedule(
  'broadcast-dispatch-1min',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
           || '/functions/v1/broadcast-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);