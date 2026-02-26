
-- Table to track Resend domain verification per organization
CREATE TABLE public.organization_email_domains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain_name TEXT NOT NULL,
  resend_domain_id TEXT, -- Resend's domain ID
  status TEXT NOT NULL DEFAULT 'pending', -- pending, verified, failed, temporary_failure
  dns_records JSONB, -- Store required DNS records from Resend
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, domain_name)
);

-- RLS
ALTER TABLE public.organization_email_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their domains"
ON public.organization_email_domains FOR SELECT
USING (public.is_org_member(organization_id));

CREATE POLICY "Org admins can insert domains"
ON public.organization_email_domains FOR INSERT
WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can update domains"
ON public.organization_email_domains FOR UPDATE
USING (public.is_org_admin(organization_id));

CREATE POLICY "Org admins can delete domains"
ON public.organization_email_domains FOR DELETE
USING (public.is_org_admin(organization_id));

-- Trigger for updated_at
CREATE TRIGGER update_org_email_domains_updated_at
BEFORE UPDATE ON public.organization_email_domains
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
