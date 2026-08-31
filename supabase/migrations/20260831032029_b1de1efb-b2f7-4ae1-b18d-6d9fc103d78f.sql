DROP POLICY IF EXISTS "Org admins can manage email settings" ON public.organization_email_settings;

CREATE POLICY "Org owners can view email settings"
ON public.organization_email_settings FOR SELECT TO authenticated
USING (public.has_org_financial_access(organization_id));

CREATE POLICY "Org owners can insert email settings"
ON public.organization_email_settings FOR INSERT TO authenticated
WITH CHECK (public.has_org_financial_access(organization_id));

CREATE POLICY "Org owners can update email settings"
ON public.organization_email_settings FOR UPDATE TO authenticated
USING (public.has_org_financial_access(organization_id))
WITH CHECK (public.has_org_financial_access(organization_id));

CREATE POLICY "Org owners can delete email settings"
ON public.organization_email_settings FOR DELETE TO authenticated
USING (public.has_org_financial_access(organization_id));