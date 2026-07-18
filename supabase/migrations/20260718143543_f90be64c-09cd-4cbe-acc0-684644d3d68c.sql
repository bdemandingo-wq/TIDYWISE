CREATE POLICY "Owners and admins can view their org Stripe settings"
  ON public.org_stripe_settings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.org_memberships om
    WHERE om.organization_id = org_stripe_settings.organization_id
      AND om.user_id = auth.uid()
      AND om.role = ANY (ARRAY['owner','admin'])
  ));