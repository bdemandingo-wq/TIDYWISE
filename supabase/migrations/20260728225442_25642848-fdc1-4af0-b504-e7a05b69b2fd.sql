CREATE OR REPLACE FUNCTION public.campaign_queue_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  PERFORM net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/process-campaign-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key'),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.campaign_queue_wake()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000002);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-campaign-queue') THEN
    BEGIN
      PERFORM cron.schedule('process-campaign-queue', '15 seconds', $cron$ SELECT public.campaign_queue_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'campaign_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/process-campaign-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Lovable-Context', 'cron',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key'),
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'campaign_queue_wake: immediate dispatch failed: %', SQLERRM;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'campaign_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS campaign_queue_wake_trigger ON public.campaign_runs;
CREATE TRIGGER campaign_queue_wake_trigger
AFTER INSERT ON public.campaign_runs
FOR EACH STATEMENT
EXECUTE FUNCTION public.campaign_queue_wake();

REVOKE ALL ON FUNCTION public.campaign_queue_dispatch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.campaign_queue_wake() FROM PUBLIC;