-- Gmail-first email: new orgs default to Gmail SMTP (Resend stays as the
-- fallback + platform transport). Existing rows are intentionally NOT touched —
-- ALTER ... SET DEFAULT only affects future inserts.
ALTER TABLE public.organization_email_settings
  ALTER COLUMN email_send_method SET DEFAULT 'gmail_smtp';

-- Raise the run-winback-drip cron timeout to 120s so a throttled run (up to
-- ~60s of pacing) completes without pg_net cutting the response short.
--
-- NOTE: there is no committed cron for run-winback-drip in this repo. If one
-- exists live (e.g. created via Lovable) under the name 'run-winback-drip',
-- this reschedules it with a 120s timeout while PRESERVING its existing
-- schedule, and reconstructs the command to the standard vault-secret pattern.
-- If no such job exists, this does NOTHING — it will not create/activate the
-- winback drip, to avoid either duplicating a differently-named live job or
-- switching on marketing email that wasn't running. Verify against cron.job
-- after applying; if the live job has a different name, update it manually.
DO $$
DECLARE
  v_schedule text;
BEGIN
  SELECT schedule INTO v_schedule FROM cron.job WHERE jobname = 'run-winback-drip';
  IF v_schedule IS NULL THEN
    RAISE NOTICE 'No run-winback-drip cron found — timeout not changed (nothing to update).';
  ELSE
    PERFORM cron.unschedule('run-winback-drip');
    PERFORM cron.schedule(
      'run-winback-drip',
      v_schedule,
      $cron$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/run-winback-drip',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
      $cron$
    );
    RAISE NOTICE 'run-winback-drip cron timeout raised to 120s (schedule preserved: %).', v_schedule;
  END IF;
END $$;
