CREATE TABLE public.campaign_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.automated_campaigns(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','paused','cancelled','completed')),
  cancel_reason text CHECK (cancel_reason IS NULL OR cancel_reason IN ('expired','user_cancelled')),
  throttle_seconds integer NOT NULL DEFAULT 60 CHECK (throttle_seconds BETWEEN 30 AND 3600),
  scheduled_at timestamptz,
  expires_at timestamptz NOT NULL,
  next_send_at timestamptz,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_opted_out_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.campaign_runs TO authenticated;
GRANT ALL ON public.campaign_runs TO service_role;

ALTER TABLE public.campaign_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their campaign runs"
ON public.campaign_runs FOR SELECT TO authenticated
USING (public.is_org_member(organization_id));

CREATE POLICY "Service role manages campaign runs"
ON public.campaign_runs FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_campaign_runs_org_status ON public.campaign_runs (organization_id, status);
CREATE INDEX idx_campaign_runs_next_send_at ON public.campaign_runs (next_send_at) WHERE status = 'running';

CREATE OR REPLACE FUNCTION public.set_campaign_run_status(p_run_id uuid, p_status text)
RETURNS public.campaign_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.campaign_runs;
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
  ELSE
    UPDATE public.campaign_runs
      SET status = 'running', paused_at = NULL, next_send_at = now()
      WHERE id = p_run_id RETURNING * INTO v_run;
  END IF;

  RETURN v_run;
END;
$$;

REVOKE ALL ON FUNCTION public.set_campaign_run_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_campaign_run_status(uuid, text) TO authenticated;

ALTER TABLE public.automated_campaigns
  ADD COLUMN throttle_seconds integer NOT NULL DEFAULT 60 CHECK (throttle_seconds BETWEEN 30 AND 3600),
  ADD COLUMN scheduled_at timestamptz;

SELECT pgmq.create('campaign_sms');
SELECT pgmq.create('campaign_sms_dlq');

SELECT pgmq.drop_queue('audit_probe_nonexistent_queue_42478');
SELECT pgmq.drop_queue('audit_probe_dlq_42478');