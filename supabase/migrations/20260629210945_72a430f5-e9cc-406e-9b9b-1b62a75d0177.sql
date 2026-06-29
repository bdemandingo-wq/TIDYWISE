
-- 1) Webhooks table
CREATE TABLE public.org_zapier_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  webhook_url text NOT NULL,
  event_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zapier_webhook_url_check CHECK (webhook_url ~* '^https://hooks\.zapier\.com/.+')
);

CREATE INDEX idx_org_zapier_webhooks_org ON public.org_zapier_webhooks(organization_id);
CREATE INDEX idx_org_zapier_webhooks_org_event_active ON public.org_zapier_webhooks(organization_id, event_type) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_zapier_webhooks TO authenticated;
GRANT ALL ON public.org_zapier_webhooks TO service_role;

ALTER TABLE public.org_zapier_webhooks ENABLE ROW LEVEL SECURITY;

-- Helper: check membership + admin role
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = _org_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE organization_id = _org_id
      AND user_id = _user_id
      AND role IN ('owner','admin')
  );
$$;

CREATE POLICY "Org members can view zapier webhooks"
  ON public.org_zapier_webhooks FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Org admins can insert zapier webhooks"
  ON public.org_zapier_webhooks FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id, auth.uid()));

CREATE POLICY "Org admins can update zapier webhooks"
  ON public.org_zapier_webhooks FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin(organization_id, auth.uid()));

CREATE POLICY "Org admins can delete zapier webhooks"
  ON public.org_zapier_webhooks FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id, auth.uid()));

CREATE TRIGGER update_org_zapier_webhooks_updated_at
  BEFORE UPDATE ON public.org_zapier_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Dispatch log
CREATE TABLE public.zapier_dispatch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  webhook_id uuid REFERENCES public.org_zapier_webhooks(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  status_code int,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_zapier_dispatch_log_org_created ON public.zapier_dispatch_log(organization_id, created_at DESC);

GRANT SELECT ON public.zapier_dispatch_log TO authenticated;
GRANT ALL ON public.zapier_dispatch_log TO service_role;

ALTER TABLE public.zapier_dispatch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view dispatch log"
  ON public.zapier_dispatch_log FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));
