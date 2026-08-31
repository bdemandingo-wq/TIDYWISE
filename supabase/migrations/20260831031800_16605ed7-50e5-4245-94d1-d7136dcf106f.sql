DROP POLICY IF EXISTS "Org admins delete GHL settings" ON public.org_ghl_settings;
DROP POLICY IF EXISTS "Org admins insert GHL settings" ON public.org_ghl_settings;
DROP POLICY IF EXISTS "Org admins read GHL settings" ON public.org_ghl_settings;
DROP POLICY IF EXISTS "Org admins update GHL settings" ON public.org_ghl_settings;

CREATE POLICY "Org owners delete GHL settings"
ON public.org_ghl_settings FOR DELETE TO authenticated
USING (public.has_org_financial_access(organization_id));
CREATE POLICY "Org owners insert GHL settings"
ON public.org_ghl_settings FOR INSERT TO authenticated
WITH CHECK (public.has_org_financial_access(organization_id));
CREATE POLICY "Org owners read GHL settings"
ON public.org_ghl_settings FOR SELECT TO authenticated
USING (public.has_org_financial_access(organization_id));
CREATE POLICY "Org owners update GHL settings"
ON public.org_ghl_settings FOR UPDATE TO authenticated
USING (public.has_org_financial_access(organization_id))
WITH CHECK (public.has_org_financial_access(organization_id));

DROP POLICY IF EXISTS "Org admins can delete gmail connection" ON public.org_gmail_connections;
DROP POLICY IF EXISTS "Org admins can insert gmail connection" ON public.org_gmail_connections;
DROP POLICY IF EXISTS "Org admins can update gmail connection" ON public.org_gmail_connections;
DROP POLICY IF EXISTS "Org admins can view gmail connection" ON public.org_gmail_connections;

CREATE POLICY "Org owners can delete gmail connection"
ON public.org_gmail_connections FOR DELETE TO authenticated
USING (public.has_org_financial_access(organization_id));
CREATE POLICY "Org owners can insert gmail connection"
ON public.org_gmail_connections FOR INSERT TO authenticated
WITH CHECK (public.has_org_financial_access(organization_id));
CREATE POLICY "Org owners can update gmail connection"
ON public.org_gmail_connections FOR UPDATE TO authenticated
USING (public.has_org_financial_access(organization_id))
WITH CHECK (public.has_org_financial_access(organization_id));
CREATE POLICY "Org owners can view gmail connection"
ON public.org_gmail_connections FOR SELECT TO authenticated
USING (public.has_org_financial_access(organization_id));

DROP POLICY IF EXISTS "Only org admins can view SMS settings" ON public.organization_sms_settings;
DROP POLICY IF EXISTS "Organization admins can delete SMS settings" ON public.organization_sms_settings;
DROP POLICY IF EXISTS "Organization admins can insert SMS settings" ON public.organization_sms_settings;
DROP POLICY IF EXISTS "Organization admins can update SMS settings" ON public.organization_sms_settings;

CREATE POLICY "Only org owners can view SMS settings"
ON public.organization_sms_settings FOR SELECT TO authenticated
USING (public.has_org_financial_access(organization_id));
CREATE POLICY "Organization owners can delete SMS settings"
ON public.organization_sms_settings FOR DELETE TO authenticated
USING (public.has_org_financial_access(organization_id));
CREATE POLICY "Organization owners can insert SMS settings"
ON public.organization_sms_settings FOR INSERT TO authenticated
WITH CHECK (public.has_org_financial_access(organization_id));
CREATE POLICY "Organization owners can update SMS settings"
ON public.organization_sms_settings FOR UPDATE TO authenticated
USING (public.has_org_financial_access(organization_id))
WITH CHECK (public.has_org_financial_access(organization_id));