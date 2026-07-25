ALTER TABLE public.organization_email_settings
  ALTER COLUMN email_send_method SET DEFAULT 'gmail_smtp';

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