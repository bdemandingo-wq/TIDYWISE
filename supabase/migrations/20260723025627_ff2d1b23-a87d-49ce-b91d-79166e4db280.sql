
-- ────────────────────────────────────────────────────────────────────────────
-- comped_access: time-limited full access grants for an organization.
-- Only service_role (via SECURITY DEFINER RPC / edge functions) may mutate.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comped_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  granted_by uuid,
  reason text,
  access_code_id uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comped_access_org_active
  ON public.comped_access (organization_id) WHERE revoked_at IS NULL;

GRANT SELECT ON public.comped_access TO authenticated;
GRANT ALL ON public.comped_access TO service_role;
ALTER TABLE public.comped_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their org comps"
  ON public.comped_access FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships m
      WHERE m.organization_id = comped_access.organization_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Platform admin can view all comps"
  ON public.comped_access FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- access_codes: redeemable codes an owner can enter to activate comped_access.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  duration_days integer NOT NULL CHECK (duration_days > 0),
  max_uses integer,
  uses integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_access_codes_code_ci ON public.access_codes (lower(code));

GRANT SELECT ON public.access_codes TO authenticated;
GRANT ALL ON public.access_codes TO service_role;
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admin can view access codes"
  ON public.access_codes FOR SELECT TO authenticated
  USING (public.is_platform_admin());

ALTER TABLE public.comped_access
  ADD CONSTRAINT comped_access_code_fk
  FOREIGN KEY (access_code_id) REFERENCES public.access_codes(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- redeem_access_code: owner-callable RPC. Validates code + inserts comp.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_access_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_code public.access_codes%ROWTYPE;
  v_org uuid;
  v_expires timestamptz;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.org_memberships
  WHERE user_id = v_user AND role IN ('owner','admin')
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Only workspace owners can redeem access codes';
  END IF;

  SELECT * INTO v_code FROM public.access_codes
  WHERE lower(code) = lower(trim(_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid code';
  END IF;
  IF NOT v_code.active THEN
    RAISE EXCEPTION 'This code is no longer active';
  END IF;
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN
    RAISE EXCEPTION 'This code has expired';
  END IF;
  IF v_code.max_uses IS NOT NULL AND v_code.uses >= v_code.max_uses THEN
    RAISE EXCEPTION 'This code has no uses remaining';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.comped_access
    WHERE organization_id = v_org
      AND access_code_id = v_code.id
      AND revoked_at IS NULL
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'This code has already been redeemed for your organization';
  END IF;

  v_expires := now() + make_interval(days => v_code.duration_days);

  INSERT INTO public.comped_access (organization_id, expires_at, granted_by, reason, access_code_id)
  VALUES (v_org, v_expires, v_user, COALESCE(v_code.reason, 'Redeemed code: ' || v_code.code), v_code.id);

  UPDATE public.access_codes SET uses = uses + 1 WHERE id = v_code.id;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org,
    'expires_at', v_expires,
    'duration_days', v_code.duration_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_access_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_access_code(text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Updated has_active_subscription: adds org-trial branch (aligns with
-- check-subscription) AND comped_access branch.
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
            'info@openarmscleaning.com',
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
