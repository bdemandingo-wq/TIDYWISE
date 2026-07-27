ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'US'
    CHECK (country_code ~ '^[A-Z]{2}$');

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS latitude  double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS latitude  double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

CREATE OR REPLACE FUNCTION public.effective_plan(_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = _org_id
        AND (o.grandfathered_lifetime = true OR o.plan_type = 'lifetime')
    ) THEN 'lifetime'
    WHEN EXISTS (
      SELECT 1 FROM public.comped_access c
      WHERE c.organization_id = _org_id
        AND c.revoked_at IS NULL
        AND c.expires_at > now()
    ) THEN 'lifetime'
    WHEN EXISTS (
      SELECT 1 FROM public.stripe_subscriptions s
      WHERE s.organization_id = _org_id
        AND s.status = 'trialing'
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    ) THEN 'lifetime'
    ELSE COALESCE(
      (SELECT o.plan_type FROM public.organizations o WHERE o.id = _org_id),
      'free'
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.effective_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_plan(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.my_effective_plan()
RETURNS TABLE (plan_type text, grandfathered boolean, organization_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT m.organization_id INTO v_org
  FROM public.org_memberships m
  WHERE m.user_id = auth.uid()
  ORDER BY m.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_org IS NULL THEN
    RETURN QUERY SELECT 'free'::text, false, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT public.effective_plan(v_org),
         COALESCE((SELECT o.grandfathered_lifetime
                   FROM public.organizations o WHERE o.id = v_org), false),
         v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.my_effective_plan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_effective_plan() TO authenticated;