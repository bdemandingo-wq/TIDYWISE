
CREATE TABLE IF NOT EXISTS public.benchmark_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('refresh_snapshots','ai_insights','opt_in_changed','blocked_opt_out')),
  status TEXT NOT NULL CHECK (status IN ('success','error','skipped')),
  duration_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_benchmark_audit_logs_org_time
  ON public.benchmark_audit_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_benchmark_audit_logs_event_time
  ON public.benchmark_audit_logs (event_type, created_at DESC);

ALTER TABLE public.benchmark_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no_client_access" ON public.benchmark_audit_logs;
CREATE POLICY "no_client_access"
  ON public.benchmark_audit_logs
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.log_benchmark_event(
  p_organization_id UUID,
  p_event_type TEXT,
  p_status TEXT,
  p_duration_ms INTEGER,
  p_metadata JSONB,
  p_error_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_meta JSONB := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  v_meta := v_meta - 'email' - 'phone' - 'address' - 'customer_name' - 'name';
  INSERT INTO public.benchmark_audit_logs (
    organization_id, event_type, status, duration_ms, metadata, error_code
  ) VALUES (
    p_organization_id, p_event_type, p_status, p_duration_ms, v_meta, p_error_code
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_benchmark_event(UUID,TEXT,TEXT,INTEGER,JSONB,TEXT) FROM PUBLIC, anon, authenticated;
