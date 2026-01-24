-- Fix the INSERT policy for org_stripe_settings - it's missing a WITH CHECK clause
DROP POLICY IF EXISTS "Admins can insert their org Stripe settings" ON public.org_stripe_settings;

CREATE POLICY "Admins can insert their org Stripe settings"
ON public.org_stripe_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM org_memberships om
    WHERE om.organization_id = org_stripe_settings.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('admin', 'owner')
  )
);