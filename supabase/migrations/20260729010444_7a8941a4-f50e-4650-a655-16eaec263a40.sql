CREATE OR REPLACE FUNCTION public.set_campaign_run_status(p_run_id uuid, p_status text)
 RETURNS campaign_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run public.campaign_runs;
  v_purged integer := 0;
BEGIN
  SELECT * INTO v_run FROM public.campaign_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign run not found';
  END IF;

  IF auth.uid() IS NULL OR NOT public.is_org_admin(v_run.organization_id) THEN
    RAISE EXCEPTION 'Access denied: admin membership required for this organization';
  END IF;

  IF NOT (
    (v_run.status = 'running' AND p_status = 'paused')
    OR (v_run.status = 'paused' AND p_status = 'running')
    OR (v_run.status IN ('running','paused') AND p_status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Invalid campaign run transition: % -> %', v_run.status, p_status;
  END IF;

  IF p_status = 'paused' THEN
    UPDATE public.campaign_runs
      SET status = 'paused', paused_at = now()
      WHERE id = p_run_id RETURNING * INTO v_run;
  ELSIF p_status = 'cancelled' THEN
    UPDATE public.campaign_runs
      SET status = 'cancelled', cancel_reason = 'user_cancelled', completed_at = now()
      WHERE id = p_run_id RETURNING * INTO v_run;

    -- Purge this run's queued messages immediately. The worker's orphan purge
    -- only runs on a tick, and the dispatcher may already be disarmed.
    WITH purged AS (
      DELETE FROM pgmq.q_campaign_sms
      WHERE (message->>'run_id') = p_run_id::text
      RETURNING msg_id
    )
    SELECT count(*) INTO v_purged FROM purged;

    RAISE NOTICE 'set_campaign_run_status: purged % queued message(s) for cancelled run %', v_purged, p_run_id;
  ELSE
    UPDATE public.campaign_runs
      SET status = 'running', paused_at = NULL, next_send_at = now()
      WHERE id = p_run_id RETURNING * INTO v_run;
  END IF;

  RETURN v_run;
END;
$function$;