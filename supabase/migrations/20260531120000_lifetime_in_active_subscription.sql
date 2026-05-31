-- has_active_subscription() must recognize lifetime + grandfathered orgs.
--
-- Bug: The existing function only checks for an active row in
-- stripe_subscriptions OR membership in the free-accounts allowlist.
-- Lifetime customers pay via Stripe Checkout in payment mode (one-time,
-- no Subscription object), so they have no stripe_subscriptions row.
-- Result: anyone who paid $300 for lifetime was locked out of every
-- product table by the RESTRICTIVE RLS gate — couldn't create a single
-- customer, booking, invoice, quote, or estimate.
--
-- Fix: add a third OR branch that returns true when the org's plan_type
-- is 'lifetime' OR grandfathered_lifetime is true. Same path covers
-- both paying lifetime buyers and the launch-grandfathered users.

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
    -- Lifetime: paid customers (plan_type='lifetime') AND grandfathered
    -- launch users (grandfathered_lifetime=true). Both honored forever.
    EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = _org_id
        AND (o.plan_type = 'lifetime' OR o.grandfathered_lifetime = true)
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
