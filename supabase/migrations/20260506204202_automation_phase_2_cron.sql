-- Schedule the 3 new automation cron jobs added in
-- 20260506203400_automation_phase_2.sql so the toggles in Automation Center
-- behave the same as the existing automations — flip the switch in the UI,
-- the cron picks up the change on its next run. No manual SQL required.
--
-- Auth pattern: x-cron-secret header (matches the new requireCronSecret
-- gate). Reads `supabase_url` + `cron_secret` from vault.decrypted_secrets.
-- If you used a different vault name for the cron secret, swap it below.
--
-- Idempotent: each schedule is unscheduled first so re-applying this
-- migration (or fixing a typo and re-running) doesn't duplicate jobs.

DO $$ BEGIN
  PERFORM cron.unschedule('seasonal-promo-sender');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'seasonal-promo-sender',
  '0 9 * * *',  -- daily at 09:00 UTC
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/seasonal-promo-sender',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

DO $$ BEGIN
  PERFORM cron.unschedule('recurring-booking-lapse-alert');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'recurring-booking-lapse-alert',
  '0 7 * * *',  -- daily at 07:00 UTC
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/recurring-booking-lapse-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

DO $$ BEGIN
  PERFORM cron.unschedule('quote-stale-reengage');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'quote-stale-reengage',
  '0 10 * * *',  -- daily at 10:00 UTC
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/quote-stale-reengage',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
