-- ────────────────────────────────────────────────────────────────────────────
-- has_active_subscription: remove 'info@openarmscleaning.com' from the
-- hardcoded email allowlist branch. All other branches unchanged.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_active_subscription(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.stripe_subscriptions s
      WHERE s.organization_id = _org_id
        AND s.status IN ('active', 'trialing', 'past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    )
    OR EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = _org_id
        AND (o.plan_type = 'lifetime' OR o.grandfathered_lifetime = true)
    )
    OR EXISTS (
      SELECT 1
      FROM public.lifetime_access_purchases lp
      JOIN auth.users u ON LOWER(u.email) = LOWER(lp.email)
      JOIN public.organizations o ON o.owner_id = u.id
      WHERE o.id = _org_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.organizations o
      JOIN auth.users u ON u.id = o.owner_id
      WHERE o.id = _org_id
        AND (
          u.email IN (
            'support@tidywisecleaning.com',
            'applereview@tidywise.com',
            'applereview@tidywise1.com'
          )
          OR u.email LIKE '%@tidywise1.com'
        )
    )
    -- Free 60-day org trial (matches check-subscription: pre-cutoff signups only)
    OR EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = _org_id
        AND o.created_at < TIMESTAMPTZ '2026-04-06 00:00:00+00'
        AND o.created_at + interval '60 days' > now()
    )
    -- Time-limited comped access
    OR EXISTS (
      SELECT 1
      FROM public.comped_access c
      WHERE c.organization_id = _org_id
        AND c.revoked_at IS NULL
        AND c.expires_at > now()
    );
$function$;
