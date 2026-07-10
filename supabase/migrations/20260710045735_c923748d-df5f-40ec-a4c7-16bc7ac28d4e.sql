
-- Allow Managers (and legacy admins) to read the org's Stripe connection status
-- so charging/setup flows can detect the org-level connection. Writes remain
-- restricted to Owners only.
DROP POLICY IF EXISTS "Admins can view their org Stripe settings" ON public.org_stripe_settings;
CREATE POLICY "Org operators can view their org Stripe settings"
ON public.org_stripe_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.org_memberships om
    WHERE om.organization_id = org_stripe_settings.organization_id
      AND om.user_id = auth.uid()
      AND om.role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])
  )
);

-- Restrict INSERT/UPDATE to Owners only (managers must not replace keys).
DROP POLICY IF EXISTS "Admins can insert their org Stripe settings" ON public.org_stripe_settings;
CREATE POLICY "Owners can insert their org Stripe settings"
ON public.org_stripe_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.org_memberships om
    WHERE om.organization_id = org_stripe_settings.organization_id
      AND om.user_id = auth.uid()
      AND om.role = 'owner'
  )
);

DROP POLICY IF EXISTS "Admins can update their org Stripe settings" ON public.org_stripe_settings;
CREATE POLICY "Owners can update their org Stripe settings"
ON public.org_stripe_settings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.org_memberships om
    WHERE om.organization_id = org_stripe_settings.organization_id
      AND om.user_id = auth.uid()
      AND om.role = 'owner'
  )
);
