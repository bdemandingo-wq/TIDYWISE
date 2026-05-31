-- Update has_active_subscription to include free-account bypass (mirrors frontend FREE_ACCOUNTS list)
CREATE OR REPLACE FUNCTION public.has_active_subscription(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- Active/trialing/past_due paid subscription
    EXISTS (
      SELECT 1
      FROM public.stripe_subscriptions s
      WHERE s.organization_id = _org_id
        AND s.status IN ('active', 'trialing', 'past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    )
    OR
    -- Free/demo accounts bypass (mirrors frontend FREE_ACCOUNTS allowlist)
    EXISTS (
      SELECT 1
      FROM public.organizations o
      JOIN auth.users u ON u.id = o.owner_id
      WHERE o.id = _org_id
        AND (
          u.email IN (
            'support@tidywisecleaning.com',
            'applereview@tidywise.com',
            'info@openarmscleaning.com',
            'applereview@tidywise1.com'
          )
          OR u.email LIKE '%@tidywise1.com'
        )
    );
$function$;

-- Restrictive RLS gate on insert/update for the 5 product tables.
-- Restrictive policies apply on top of existing permissive policies; both must pass.
-- service_role bypasses RLS, so edge functions / webhooks / backfills are unaffected.

-- bookings
DROP POLICY IF EXISTS "Require active subscription to insert bookings" ON public.bookings;
CREATE POLICY "Require active subscription to insert bookings"
  ON public.bookings AS RESTRICTIVE
  FOR INSERT TO public
  WITH CHECK (public.has_active_subscription(organization_id));

DROP POLICY IF EXISTS "Require active subscription to update bookings" ON public.bookings;
CREATE POLICY "Require active subscription to update bookings"
  ON public.bookings AS RESTRICTIVE
  FOR UPDATE TO public
  USING (public.has_active_subscription(organization_id))
  WITH CHECK (public.has_active_subscription(organization_id));

-- customers
DROP POLICY IF EXISTS "Require active subscription to insert customers" ON public.customers;
CREATE POLICY "Require active subscription to insert customers"
  ON public.customers AS RESTRICTIVE
  FOR INSERT TO public
  WITH CHECK (public.has_active_subscription(organization_id));

DROP POLICY IF EXISTS "Require active subscription to update customers" ON public.customers;
CREATE POLICY "Require active subscription to update customers"
  ON public.customers AS RESTRICTIVE
  FOR UPDATE TO public
  USING (public.has_active_subscription(organization_id))
  WITH CHECK (public.has_active_subscription(organization_id));

-- invoices
DROP POLICY IF EXISTS "Require active subscription to insert invoices" ON public.invoices;
CREATE POLICY "Require active subscription to insert invoices"
  ON public.invoices AS RESTRICTIVE
  FOR INSERT TO public
  WITH CHECK (public.has_active_subscription(organization_id));

DROP POLICY IF EXISTS "Require active subscription to update invoices" ON public.invoices;
CREATE POLICY "Require active subscription to update invoices"
  ON public.invoices AS RESTRICTIVE
  FOR UPDATE TO public
  USING (public.has_active_subscription(organization_id))
  WITH CHECK (public.has_active_subscription(organization_id));

-- quotes
DROP POLICY IF EXISTS "Require active subscription to insert quotes" ON public.quotes;
CREATE POLICY "Require active subscription to insert quotes"
  ON public.quotes AS RESTRICTIVE
  FOR INSERT TO public
  WITH CHECK (public.has_active_subscription(organization_id));

DROP POLICY IF EXISTS "Require active subscription to update quotes" ON public.quotes;
CREATE POLICY "Require active subscription to update quotes"
  ON public.quotes AS RESTRICTIVE
  FOR UPDATE TO public
  USING (public.has_active_subscription(organization_id))
  WITH CHECK (public.has_active_subscription(organization_id));

-- estimates
DROP POLICY IF EXISTS "Require active subscription to insert estimates" ON public.estimates;
CREATE POLICY "Require active subscription to insert estimates"
  ON public.estimates AS RESTRICTIVE
  FOR INSERT TO public
  WITH CHECK (public.has_active_subscription(organization_id));

DROP POLICY IF EXISTS "Require active subscription to update estimates" ON public.estimates;
CREATE POLICY "Require active subscription to update estimates"
  ON public.estimates AS RESTRICTIVE
  FOR UPDATE TO public
  USING (public.has_active_subscription(organization_id))
  WITH CHECK (public.has_active_subscription(organization_id));