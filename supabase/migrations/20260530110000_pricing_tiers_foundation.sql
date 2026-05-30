-- Pricing-tier launch foundation.
--
-- Introduces the four customer-facing tiers (basic, pro, custom, lifetime)
-- alongside the existing trial/standard/free/enterprise values; grandfathers
-- every currently-active organization into free lifetime access so the
-- price launch doesn't disrupt anyone already in the product; adds the
-- supporting tables needed for the lifetime spot counter, the lifetime
-- waitlist, Custom-plan done-for-you requests, and the separate
-- ad-management retainer subscriptions.
--
-- Cancelled organizations (plan_type='free') and dormant enterprise rows
-- are intentionally NOT grandfathered — they get treated as net-new
-- sign-ups under the new paid tiers if they ever come back.

-- ── 1. Extend plan_type to the new tier names ────────────────────────────
-- Keeps the legacy values so nothing existing breaks. New columns/checks
-- are additive only.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_type_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_type_check
    CHECK (plan_type IN (
      'trial', 'standard', 'free', 'enterprise',
      'basic', 'pro', 'custom', 'lifetime'
    ));

-- ── 2. Grandfather flag ──────────────────────────────────────────────────
-- True for any org that existed at the moment of launch (excluding cancelled
-- and enterprise). The feature-gating layer always treats grandfathered=true
-- as 'has every feature', independent of plan_type — that way if we ever
-- need to bump the grandfathered org back to a paid plan we can do it
-- without losing their feature access.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS grandfathered_lifetime BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS grandfathered_at TIMESTAMPTZ;

-- ── 3. Mark every currently-active org as grandfathered ──────────────────
-- 'trial' = signed up, hasn't paid yet, gets lifetime as a "thanks for
--   being here before launch" gesture.
-- 'standard' = active paying customer (the existing $97 subscriber today).
-- Excluded: 'free' (already cancelled), 'enterprise' (special-cased
-- elsewhere), 'lifetime' (already on it).
UPDATE public.organizations
SET grandfathered_lifetime = true,
    grandfathered_at = now(),
    plan_type = 'lifetime'
WHERE plan_type IN ('trial', 'standard');

-- ── 4. Lifetime offer state (single-row counter) ─────────────────────────
-- Hard-capped at total_spots; sold_spots is atomically incremented inside
-- the Stripe webhook after a successful $300 payment_intent. The CHECK
-- constraint is the last line of defense against an oversold race: if two
-- buyers somehow both make it past spots-remaining=1, the second insert
-- will fail and the webhook handler refunds.
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

-- Public read so the marketing site and pricing page can show the live
-- "X of 50 left" counter without an auth round-trip.
GRANT SELECT ON public.lifetime_offer_state TO anon, authenticated;
GRANT ALL ON public.lifetime_offer_state TO service_role;

ALTER TABLE public.lifetime_offer_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lifetime counter is public" ON public.lifetime_offer_state
  FOR SELECT USING (true);

-- ── 5. Lifetime waitlist (collected after sold-out) ──────────────────────
CREATE TABLE IF NOT EXISTS public.lifetime_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);

GRANT INSERT ON public.lifetime_waitlist TO anon, authenticated;
GRANT ALL ON public.lifetime_waitlist TO service_role;

ALTER TABLE public.lifetime_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can join the waitlist" ON public.lifetime_waitlist
  FOR INSERT WITH CHECK (true);
-- Only admins read the waitlist (no SELECT policy for authenticated/anon).

-- ── 6. Custom-plan done-for-you requests ─────────────────────────────────
-- One row per request. 1/month/cap is enforced in app code by querying
-- this table for status NOT IN ('declined','cancelled') within the current
-- billing window.
CREATE TABLE IF NOT EXISTS public.custom_work_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  -- Fixed menu key OR 'something_else' for free-form
  request_type text NOT NULL CHECK (request_type IN (
    'website_build',
    'sms_setup',
    'email_marketing_setup',
    'customer_import',
    'scripts_documents_pack',
    'something_else'
  )),
  -- Required when request_type='something_else'; optional supplement otherwise
  details text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted',
    'approved',
    'in_progress',
    'completed',
    'declined',
    'cancelled'
  )),
  declined_reason text,
  admin_notes text,
  -- Billing-period anchor for the 1/month cap. Set by app code at insert
  -- time using the user's current subscription period.
  billing_period_start timestamptz NOT NULL,
  billing_period_end timestamptz NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_work_requests_org_idx
  ON public.custom_work_requests(organization_id);
CREATE INDEX IF NOT EXISTS custom_work_requests_status_idx
  ON public.custom_work_requests(status);
CREATE INDEX IF NOT EXISTS custom_work_requests_period_idx
  ON public.custom_work_requests(organization_id, billing_period_start);

GRANT SELECT, INSERT ON public.custom_work_requests TO authenticated;
GRANT ALL ON public.custom_work_requests TO service_role;

ALTER TABLE public.custom_work_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their org's requests"
  ON public.custom_work_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_memberships.user_id = auth.uid()
        AND org_memberships.organization_id = custom_work_requests.organization_id
    )
  );

CREATE POLICY "Users submit requests for their org"
  ON public.custom_work_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_memberships.user_id = auth.uid()
        AND org_memberships.organization_id = custom_work_requests.organization_id
    )
  );

-- ── 7. Ad-management retainer subscriptions ──────────────────────────────
-- These are SEPARATE Stripe subscriptions from the main TidyWise plan —
-- one row per platform the customer is paying for ($400/mo each). Tied
-- to the org so we can auto-cancel them when the parent TidyWise sub is
-- cancelled (per product spec: ads can't outlive the TidyWise sub
-- because the customer's lead flow lives in TidyWise).
CREATE TABLE IF NOT EXISTS public.ad_management_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN (
    'google_search',
    'google_lsa',
    'facebook'
  )),
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  stripe_price_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',
    'past_due',
    'cancelled',
    'paused'
  )),
  monthly_amount_cents integer NOT NULL DEFAULT 40000,
  started_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_mgmt_org_idx
  ON public.ad_management_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS ad_mgmt_status_idx
  ON public.ad_management_subscriptions(status);
-- One active subscription per (org, platform) — prevents double-buys.
CREATE UNIQUE INDEX IF NOT EXISTS ad_mgmt_one_active_per_platform
  ON public.ad_management_subscriptions(organization_id, platform)
  WHERE status = 'active';

GRANT SELECT ON public.ad_management_subscriptions TO authenticated;
GRANT ALL ON public.ad_management_subscriptions TO service_role;

ALTER TABLE public.ad_management_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their org's ad subs"
  ON public.ad_management_subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_memberships.user_id = auth.uid()
        AND org_memberships.organization_id = ad_management_subscriptions.organization_id
    )
  );

-- ── 8. updated_at triggers (idiomatic to this codebase) ──────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at_pricing()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_lifetime_offer_state_updated ON public.lifetime_offer_state;
CREATE TRIGGER trg_lifetime_offer_state_updated
BEFORE UPDATE ON public.lifetime_offer_state
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_pricing();

DROP TRIGGER IF EXISTS trg_custom_work_requests_updated ON public.custom_work_requests;
CREATE TRIGGER trg_custom_work_requests_updated
BEFORE UPDATE ON public.custom_work_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_pricing();

DROP TRIGGER IF EXISTS trg_ad_management_subscriptions_updated ON public.ad_management_subscriptions;
CREATE TRIGGER trg_ad_management_subscriptions_updated
BEFORE UPDATE ON public.ad_management_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_pricing();
