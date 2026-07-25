-- Schedule the Phase-2 automation crons — EXCEPT recurring-booking-lapse-alert.
--
-- Supersedes the scheduling in 20260506204202_automation_phase_2_cron.sql for
-- these jobs. seasonal-promo-sender and quote-stale-reengage are (re)scheduled;
-- recurring-booking-lapse-alert is intentionally left UNSCHEDULED because it is
-- structurally miswired for this app: it keys its catch-up check on
-- bookings.recurring_booking_id, a column nothing in the codebase ever writes,
-- so any time it fires it's a false positive. Do not schedule it until that is
-- fixed (link recurring_booking_id on generation, or redefine "lapse").
--
-- Idempotent: each job is unscheduled first, so re-applying can't duplicate a
-- job, and the lapse job is removed if a prior apply had scheduled it.
--
-- Auth pattern: x-cron-secret header (requireCronSecret gate). Reads
-- supabase_url + cron_secret from vault.decrypted_secrets.

-- seasonal-promo-sender — daily at 09:00 UTC
DO $$ BEGIN
  PERFORM cron.unschedule('seasonal-promo-sender');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'seasonal-promo-sender',
  '0 9 * * *',
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

-- quote-stale-reengage — daily at 10:00 UTC
DO $$ BEGIN
  PERFORM cron.unschedule('quote-stale-reengage');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'quote-stale-reengage',
  '0 10 * * *',
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

-- recurring-booking-lapse-alert — intentionally NOT scheduled (see header).
-- Defensively remove it in case a prior migration scheduled it.
DO $$ BEGIN
  PERFORM cron.unschedule('recurring-booking-lapse-alert');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;