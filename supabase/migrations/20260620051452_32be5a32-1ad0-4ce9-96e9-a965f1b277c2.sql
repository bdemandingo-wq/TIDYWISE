
-- 1. Lock down Stripe credential columns from client roles
REVOKE SELECT (stripe_secret_key, stripe_access_token, stripe_refresh_token)
  ON public.org_stripe_settings FROM anon, authenticated;

-- 2. Lock down Resend API key column from client roles
REVOKE SELECT (resend_api_key) ON public.business_settings FROM anon, authenticated;

-- 3. Replace get_user_organization_id() usages with is_org_member(organization_id)

-- automated_campaigns
DROP POLICY IF EXISTS "Authenticated org members can manage campaigns" ON public.automated_campaigns;
CREATE POLICY "Org members can manage campaigns"
  ON public.automated_campaigns
  FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- locations
DROP POLICY IF EXISTS "Org members can manage locations" ON public.locations;
CREATE POLICY "Org members can manage locations"
  ON public.locations
  FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- service_categories
DROP POLICY IF EXISTS "Org members can manage categories" ON public.service_categories;
CREATE POLICY "Org members can manage categories"
  ON public.service_categories
  FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- services: the legacy ALL policy uses get_user_organization_id; replace with org-member scoped
DROP POLICY IF EXISTS "Org members can manage services" ON public.services;
CREATE POLICY "Org members can manage services"
  ON public.services
  FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- team_messages: tighten admin manage policy to use is_org_admin against the message's booking org
DROP POLICY IF EXISTS "Org admins can manage team messages" ON public.team_messages;
CREATE POLICY "Org admins can manage team messages"
  ON public.team_messages
  FOR ALL
  USING (
    (booking_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = team_messages.booking_id
        AND public.is_org_admin(b.organization_id)
    ))
    OR
    (booking_id IS NULL AND organization_id IS NOT NULL AND public.is_org_admin(organization_id))
  )
  WITH CHECK (
    (booking_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = team_messages.booking_id
        AND public.is_org_admin(b.organization_id)
    ))
    OR
    (booking_id IS NULL AND organization_id IS NOT NULL AND public.is_org_admin(organization_id))
  );

-- 4. review_requests: add organization_id and tighten staff scope
ALTER TABLE public.review_requests
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Backfill from bookings
UPDATE public.review_requests rr
SET organization_id = b.organization_id
FROM public.bookings b
WHERE rr.booking_id = b.id
  AND rr.organization_id IS NULL;

-- Index for lookups
CREATE INDEX IF NOT EXISTS review_requests_organization_id_idx
  ON public.review_requests(organization_id);

-- Keep new rows in sync via trigger (defensive, in case callers omit org_id)
CREATE OR REPLACE FUNCTION public.set_review_request_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.booking_id IS NOT NULL THEN
    SELECT b.organization_id INTO NEW.organization_id
    FROM public.bookings b
    WHERE b.id = NEW.booking_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_review_request_organization_id_trg ON public.review_requests;
CREATE TRIGGER set_review_request_organization_id_trg
  BEFORE INSERT OR UPDATE ON public.review_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_review_request_organization_id();

-- Tighten staff SELECT policy: require staff's org matches review's organization_id
DROP POLICY IF EXISTS "Staff can view own reviews in their org" ON public.review_requests;
CREATE POLICY "Staff can view own reviews in their org"
  ON public.review_requests
  FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND staff_id IN (
      SELECT s.id FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id = review_requests.organization_id
    )
  );

-- Tighten admin policy to also use the explicit organization_id when present
DROP POLICY IF EXISTS "Org admins can manage review requests" ON public.review_requests;
CREATE POLICY "Org admins can manage review requests"
  ON public.review_requests
  FOR ALL
  USING (
    (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = review_requests.booking_id
        AND public.is_org_admin(b.organization_id)
    )
  )
  WITH CHECK (
    (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = review_requests.booking_id
        AND public.is_org_admin(b.organization_id)
    )
  );
