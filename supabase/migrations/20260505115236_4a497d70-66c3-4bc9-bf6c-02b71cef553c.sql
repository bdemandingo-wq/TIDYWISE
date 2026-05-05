
-- Gmail per-org connections
CREATE TABLE public.org_gmail_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  access_token text,
  access_token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  connected_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_refreshed_at timestamptz,
  last_send_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_gmail_connections_org ON public.org_gmail_connections(organization_id);
CREATE INDEX idx_org_gmail_connections_status ON public.org_gmail_connections(status);

CREATE OR REPLACE FUNCTION public.validate_gmail_connection_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('active','revoked','expired') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be active, revoked, or expired.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_gmail_connection_status
BEFORE INSERT OR UPDATE ON public.org_gmail_connections
FOR EACH ROW EXECUTE FUNCTION public.validate_gmail_connection_status();

CREATE TRIGGER trg_org_gmail_connections_updated_at
BEFORE UPDATE ON public.org_gmail_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.org_gmail_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view gmail connection"
ON public.org_gmail_connections FOR SELECT TO authenticated
USING (public.is_org_member(organization_id));

CREATE POLICY "Org admins can insert gmail connection"
ON public.org_gmail_connections FOR INSERT TO authenticated
WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can update gmail connection"
ON public.org_gmail_connections FOR UPDATE TO authenticated
USING (public.is_org_admin(organization_id))
WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can delete gmail connection"
ON public.org_gmail_connections FOR DELETE TO authenticated
USING (public.is_org_admin(organization_id));

-- Email send failure log
CREATE TABLE public.email_send_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  subject text,
  provider text NOT NULL DEFAULT 'gmail',
  error text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_send_failures_org_time ON public.email_send_failures(organization_id, attempted_at DESC);

ALTER TABLE public.email_send_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view email failures"
ON public.email_send_failures FOR SELECT TO authenticated
USING (public.is_org_member(organization_id));
