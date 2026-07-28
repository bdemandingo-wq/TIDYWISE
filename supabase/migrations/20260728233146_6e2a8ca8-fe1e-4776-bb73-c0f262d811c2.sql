CREATE OR REPLACE FUNCTION public.campaign_queue_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_runs WHERE status IN ('pending','running','paused')
  ) THEN
    BEGIN
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000002);
      IF EXISTS (
        SELECT 1 FROM public.campaign_runs WHERE status IN ('pending','running','paused')
      ) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-campaign-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'campaign_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'campaign_queue_dispatch: missing vault secret (url present: %, key present: %)',
      v_url IS NOT NULL, v_key IS NOT NULL;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/process-campaign-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || v_key,
      'apikey', v_key,
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$$;