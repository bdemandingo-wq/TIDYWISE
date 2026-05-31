
CREATE TABLE public.ad_management_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('google_search','google_lsa','facebook')),
  business_name TEXT,
  service_area TEXT,
  monthly_budget NUMERIC,
  has_ad_accounts BOOLEAN DEFAULT false,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ad_mgmt_requests_org ON public.ad_management_requests(organization_id);
CREATE INDEX idx_ad_mgmt_requests_status ON public.ad_management_requests(status);

GRANT SELECT, INSERT, UPDATE ON public.ad_management_requests TO authenticated;
GRANT ALL ON public.ad_management_requests TO service_role;

ALTER TABLE public.ad_management_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their ad mgmt requests"
ON public.ad_management_requests FOR SELECT
TO authenticated
USING (public.is_org_member(organization_id) OR public.is_platform_admin());

CREATE POLICY "Org admins can create ad mgmt requests"
ON public.ad_management_requests FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Platform admins can update ad mgmt requests"
ON public.ad_management_requests FOR UPDATE
TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());
