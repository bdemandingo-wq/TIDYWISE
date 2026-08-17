select cron.unschedule('billing-backfill-nightly')
where exists (select 1 from cron.job where jobname = 'billing-backfill-nightly');

select cron.schedule(
  'billing-backfill-nightly',
  '0 3 * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
           || '/functions/v1/billing-backfill',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := jsonb_build_object('resource', r, 'mode', 'run', 'restart', true, 'maxPages', 50)
  )
  from unnest(array[
    'subscriptions','invoices','charges','refunds','disputes','checkout_sessions'
  ]) as r;
  $cron$
);