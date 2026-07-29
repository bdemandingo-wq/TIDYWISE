-- Release a claimed pgmq message (set visibility timeout to N seconds from now)
CREATE OR REPLACE FUNCTION public.set_message_vt(queue_name text, message_id bigint, vt_seconds integer DEFAULT 0)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM pgmq.set_vt(queue_name, message_id, vt_seconds);
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$function$;

-- Push an arbitrary payload directly onto a DLQ (no source message to delete)
CREATE OR REPLACE FUNCTION public.send_to_dlq(dlq_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  RETURN new_id;
END;
$function$;

-- Atomic counter increment on campaign_runs
CREATE OR REPLACE FUNCTION public.increment_campaign_run_counter(
  p_run_id uuid,
  p_counter text,
  p_amount integer DEFAULT 1,
  p_next_send_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_counter NOT IN ('sent_count', 'failed_count', 'skipped_opted_out_count') THEN
    RAISE EXCEPTION 'invalid counter %', p_counter;
  END IF;

  IF p_counter = 'sent_count' THEN
    UPDATE public.campaign_runs
      SET sent_count = COALESCE(sent_count, 0) + p_amount,
          next_send_at = COALESCE(p_next_send_at, next_send_at)
      WHERE id = p_run_id;
  ELSIF p_counter = 'failed_count' THEN
    UPDATE public.campaign_runs
      SET failed_count = COALESCE(failed_count, 0) + p_amount,
          next_send_at = COALESCE(p_next_send_at, next_send_at)
      WHERE id = p_run_id;
  ELSE
    UPDATE public.campaign_runs
      SET skipped_opted_out_count = COALESCE(skipped_opted_out_count, 0) + p_amount,
          next_send_at = COALESCE(p_next_send_at, next_send_at)
      WHERE id = p_run_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_message_vt(text, bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_to_dlq(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_campaign_run_counter(uuid, text, integer, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_message_vt(text, bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.send_to_dlq(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_campaign_run_counter(uuid, text, integer, timestamptz) TO service_role;