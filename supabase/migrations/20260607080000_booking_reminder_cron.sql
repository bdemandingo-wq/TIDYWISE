-- Schedule the appointment-reminder cron.
--
-- BUG: send-booking-reminder has existed with a "cron mode" code path
-- for a while (no body = iterate all orgs, find bookings in each org's
-- reminder window, send SMS/email), but NO cron job ever called it.
-- So appointment reminders only fired when an admin manually clicked
-- "Send reminder" on a booking row. Customers walked into appointments
-- with zero notice they were happening.
--
-- The function looks for bookings whose scheduled_at lands inside a
-- ±15 minute window around each configured reminder interval
-- (24h, 4h, 1h, etc per organization_reminder_intervals). To catch
-- every booking exactly once, the cron has to run at least as often
-- as that window — every 15 minutes is the safest match.
--
-- Idempotent: unschedules any prior version first.

DO $$ BEGIN
  PERFORM cron.unschedule('send-booking-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'send-booking-reminders',
  '*/15 * * * *',  -- every 15 minutes, all hours
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/send-booking-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
