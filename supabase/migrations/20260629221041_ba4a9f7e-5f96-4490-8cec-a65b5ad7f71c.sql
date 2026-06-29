
-- =========================================================================
-- 1) org_ghl_settings
-- =========================================================================
CREATE TABLE public.org_ghl_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  webhook_url text,
  auth_header_name text NOT NULL DEFAULT 'Authorization',
  auth_token text,
  event_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_ghl_settings TO authenticated;
GRANT ALL ON public.org_ghl_settings TO service_role;

-- Hide the auth_token from the client API (admins still configure it via the
-- settings card, which writes it; edge functions read it with service role).
REVOKE SELECT (auth_token) ON public.org_ghl_settings FROM anon, authenticated;

ALTER TABLE public.org_ghl_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins read GHL settings"
  ON public.org_ghl_settings FOR SELECT
  TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE POLICY "Org admins insert GHL settings"
  ON public.org_ghl_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Org admins update GHL settings"
  ON public.org_ghl_settings FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Org admins delete GHL settings"
  ON public.org_ghl_settings FOR DELETE
  TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE TRIGGER trg_org_ghl_settings_updated_at
  BEFORE UPDATE ON public.org_ghl_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 2) ghl_dispatch_log
-- =========================================================================
CREATE TABLE public.ghl_dispatch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('success','failed','retrying')),
  http_status integer,
  attempt integer NOT NULL DEFAULT 1,
  latency_ms integer,
  webhook_url text,
  payload jsonb,
  response_snippet text,
  error_code text,
  error_hint text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ghl_dispatch_log TO authenticated;
GRANT ALL ON public.ghl_dispatch_log TO service_role;

ALTER TABLE public.ghl_dispatch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins read GHL dispatch log"
  ON public.ghl_dispatch_log FOR SELECT
  TO authenticated
  USING (public.is_org_admin(organization_id));

CREATE INDEX idx_ghl_dispatch_log_org_created
  ON public.ghl_dispatch_log (organization_id, created_at DESC);
CREATE INDEX idx_ghl_dispatch_log_event
  ON public.ghl_dispatch_log (organization_id, event_type, created_at DESC);

-- =========================================================================
-- 3) helper: edge function reads webhook + token
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_org_ghl_dispatch_config(_org_id uuid)
RETURNS TABLE (
  enabled boolean,
  webhook_url text,
  auth_header_name text,
  auth_token text,
  event_config jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.enabled, s.webhook_url, s.auth_header_name, s.auth_token, s.event_config
  FROM public.org_ghl_settings s
  WHERE s.organization_id = _org_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_org_ghl_dispatch_config(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_ghl_dispatch_config(uuid) TO service_role;
