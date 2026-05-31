-- ── 1. Add lifetime columns to organizations (idempotent) ─────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'trial';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS grandfathered_lifetime BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS grandfathered_at TIMESTAMPTZ;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_type_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_type_check
    CHECK (plan_type IS NULL OR plan_type IN (
      'trial', 'standard', 'free', 'enterprise',
      'basic', 'pro', 'custom', 'lifetime'
    ));

-- ── 2. lifetime_access_purchases ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lifetime_access_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  stripe_session_id text,
  stripe_payment_intent_id text,
  amount_cents integer NOT NULL DEFAULT 30000,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lifetime_access_purchases_session_uniq
  ON public.lifetime_access_purchases(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lifetime_access_purchases_email_idx
  ON public.lifetime_access_purchases(LOWER(email));
CREATE INDEX IF NOT EXISTS lifetime_access_purchases_user_idx
  ON public.lifetime_access_purchases(user_id);
CREATE INDEX IF NOT EXISTS lifetime_access_purchases_org_idx
  ON public.lifetime_access_purchases(organization_id);

GRANT SELECT ON public.lifetime_access_purchases TO authenticated;
GRANT ALL ON public.lifetime_access_purchases TO service_role;

ALTER TABLE public.lifetime_access_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see their own lifetime purchase" ON public.lifetime_access_purchases;
CREATE POLICY "Users see their own lifetime purchase"
  ON public.lifetime_access_purchases FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ── 3. lifetime_offer_state ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lifetime_offer_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_spots integer NOT NULL DEFAULT 50,
  sold_spots integer NOT NULL DEFAULT 0,
  sold_out_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lifetime_not_oversold CHECK (sold_spots <= total_spots)
);

INSERT INTO public.lifetime_offer_state (id, total_spots, sold_spots)
VALUES (1, 50, 0)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.lifetime_offer_state TO anon, authenticated;
GRANT ALL ON public.lifetime_offer_state TO service_role;

ALTER TABLE public.lifetime_offer_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lifetime counter is public" ON public.lifetime_offer_state;
CREATE POLICY "Lifetime counter is public" ON public.lifetime_offer_state
  FOR SELECT USING (true);

-- ── 4. lifetime_waitlist ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lifetime_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lifetime_waitlist_email_uniq
  ON public.lifetime_waitlist(LOWER(email));

GRANT INSERT ON public.lifetime_waitlist TO anon, authenticated;
GRANT ALL ON public.lifetime_waitlist TO service_role;

ALTER TABLE public.lifetime_waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can join lifetime waitlist" ON public.lifetime_waitlist;
CREATE POLICY "Anyone can join lifetime waitlist"
  ON public.lifetime_waitlist FOR INSERT WITH CHECK (true);

-- ── 5. Grandfather every currently-existing organization ─────────────
UPDATE public.organizations
SET
  plan_type = 'lifetime',
  grandfathered_lifetime = true,
  grandfathered_at = COALESCE(grandfathered_at, now())
WHERE grandfathered_lifetime = false
  AND (plan_type IS NULL OR plan_type IN ('trial', 'standard'));

-- ── 6. has_active_subscription() with lifetime recognition ───────────
CREATE OR REPLACE FUNCTION public.has_active_subscription(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.stripe_subscriptions s
      WHERE s.organization_id = _org_id
        AND s.status IN ('active', 'trialing', 'past_due')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = _org_id
        AND (o.plan_type = 'lifetime' OR o.grandfathered_lifetime = true)
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.lifetime_access_purchases lp
      JOIN auth.users u ON LOWER(u.email) = LOWER(lp.email)
      JOIN public.organizations o ON o.owner_id = u.id
      WHERE o.id = _org_id
    )
    OR
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