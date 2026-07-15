-- Restores 7 tables that earlier migration files declare but that never
-- actually landed in the live database (confirmed via direct probing —
-- see the 2026-07-15 migration-drift audit). Schema, indexes, and grants
-- below are copied verbatim from each original migration; only two RLS
-- policies were corrected, and both corrections are called out explicitly
-- rather than silently guessed. Everything else is a faithful recreation,
-- not a redesign.
--
-- All CREATE statements are idempotent (IF NOT EXISTS / DROP...IF EXISTS)
-- so this is safe to run even if any one of these tables partially exists.

-- ============================================================================
-- 1. automation_fire_log
--    Source: 20260506203400_automation_phase_2.sql — copied as-is, no
--    defect found in the original DDL.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.automation_fire_log (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  automation_type TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  fired_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_automation_fire_log_dedupe
  ON public.automation_fire_log(organization_id, automation_type, target_id, fired_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_fire_log_org_fired
  ON public.automation_fire_log(organization_id, fired_at DESC);

ALTER TABLE public.automation_fire_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Org members can read fire log"
    ON public.automation_fire_log FOR SELECT
    USING (public.is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role can insert fire log"
    ON public.automation_fire_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. device_push_tokens
--    Source: 20260414000000_add_push_tokens.sql — copied as-is, no defect
--    found in the original DDL.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID,
  token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users manage own push tokens"
    ON public.device_push_tokens
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access to push tokens"
    ON public.device_push_tokens
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_tokens_org ON public.device_push_tokens(organization_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.device_push_tokens(user_id);

-- ============================================================================
-- 3. custom_work_requests
--    Source: 20260530110000_pricing_tiers_foundation.sql — copied as-is,
--    no defect found in the original DDL. (This migration also declares
--    lifetime_offer_state and lifetime_waitlist, both of which DID land
--    live, so whatever stopped this file from finishing ran out somewhere
--    between those and this section — cause not identified, DDL itself
--    checks out.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.custom_work_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  request_type text NOT NULL CHECK (request_type IN (
    'website_build',
    'sms_setup',
    'email_marketing_setup',
    'customer_import',
    'scripts_documents_pack',
    'something_else'
  )),
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

DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 4. ad_management_subscriptions
--    Source: 20260530110000_pricing_tiers_foundation.sql — copied as-is,
--    same file/cause as custom_work_requests above.
-- ============================================================================
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
CREATE UNIQUE INDEX IF NOT EXISTS ad_mgmt_one_active_per_platform
  ON public.ad_management_subscriptions(organization_id, platform)
  WHERE status = 'active';

GRANT SELECT ON public.ad_management_subscriptions TO authenticated;
GRANT ALL ON public.ad_management_subscriptions TO service_role;

ALTER TABLE public.ad_management_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- updated_at triggers for the two tables above (also from the same
-- source migration, never applied since the tables themselves never
-- landed).
CREATE OR REPLACE FUNCTION public.set_updated_at_pricing()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_custom_work_requests_updated ON public.custom_work_requests;
CREATE TRIGGER trg_custom_work_requests_updated
BEFORE UPDATE ON public.custom_work_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_pricing();

DROP TRIGGER IF EXISTS trg_ad_management_subscriptions_updated ON public.ad_management_subscriptions;
CREATE TRIGGER trg_ad_management_subscriptions_updated
BEFORE UPDATE ON public.ad_management_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_pricing();

-- ============================================================================
-- 5. booking_checkins
--    Source: 20260413130000_all_new_features.sql.
--
--    ROOT CAUSE FOUND, NOT JUST GUESSED: the original migration's RLS
--    policies for this table (and winback_drip_log below, and
--    property_notes earlier in the same file) reference a table called
--    "organization_members", which has never existed anywhere in this
--    project — the real table is "org_memberships". That's a plain typo
--    (occurs nowhere else in 427 migration files), and it's almost
--    certainly why every CREATE TABLE statement after it in this same
--    file never ran: property_notes' own table got created (it appears
--    just before the broken policy line) but never got ITS intended
--    policies either — confirmed live, it currently only has two
--    different, later-added policies instead. booking_checkins and
--    winback_drip_log, which come after the broken statement in the same
--    file, never got created at all.
--
--    CORRECTION MADE (flagging rather than silently deciding): the
--    original policy names say "Org admin views/manages ..." but the
--    literal original query (organization_id IN (SELECT organization_id
--    FROM organization_members WHERE user_id = auth.uid())) does not
--    actually filter by role — had the table name been right, it would
--    have matched ANY org member, not just admins. I chose to honor the
--    policy NAME's stated intent (admin-only for the manage/view-all
--    policy) using the established public.is_org_admin(org_id, user_id)
--    function already used elsewhere in this codebase, rather than
--    reproduce the name/logic mismatch. If the original intent was
--    actually "any org member", this is a one-line change to swap
--    is_org_admin(...) for the org_memberships EXISTS pattern used on
--    custom_work_requests above.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.booking_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  checkin_type TEXT NOT NULL CHECK (checkin_type IN ('check_in', 'check_out')),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  address_match BOOLEAN,
  distance_meters INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.booking_checkins ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Staff manages own checkins" ON public.booking_checkins FOR ALL
    USING (staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Org admin views checkins" ON public.booking_checkins FOR SELECT
    USING (public.is_org_admin(organization_id, auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 6. winback_drip_log
--    Source: 20260413130000_all_new_features.sql — same
--    organization_members typo and same is_org_admin correction as
--    booking_checkins above.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.winback_drip_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  step INTEGER NOT NULL CHECK (step IN (1, 2, 3)),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, customer_id, step)
);

ALTER TABLE public.winback_drip_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Org admin views winback log" ON public.winback_drip_log FOR ALL
    USING (public.is_org_admin(organization_id, auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role needs unrestricted write access for run-winback-drip to
-- log sends — the original migration didn't grant this explicitly, but
-- service_role bypasses RLS by default in this project's convention
-- (matches automation_fire_log's service-role-only INSERT policy and
-- every other cron-written log table), so no extra policy is needed here.

-- ============================================================================
-- 7. subscription_reminder_log
--    Source: 20260530100000_subscription_reminder_log.sql.
--
--    ROOT CAUSE FOUND, NOT JUST GUESSED: the original policy joined
--    against profiles.stripe_customer_id — confirmed via direct probe
--    that this column does not exist anywhere on public.profiles (that
--    project apparently never got that column, unlike subscription_status
--    /subscription_tier/trial_ends_at/billing_cycle, which do exist).
--
--    CORRECTION MADE: Stripe customer IDs live on
--    public.stripe_subscriptions (organization-scoped), not on profiles
--    (user-scoped) in this schema. Rewritten to scope through the user's
--    org membership and that org's stripe_subscriptions row instead —
--    same end intent ("a user can see reminders about a subscription
--    that's theirs"), reachable via data that actually exists.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.subscription_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_subscription_id text NOT NULL,
  stripe_customer_id text,
  email text,
  period_end_sec bigint NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_reminder_log_unique_period
  ON public.subscription_reminder_log(stripe_subscription_id, period_end_sec);

CREATE INDEX IF NOT EXISTS subscription_reminder_log_customer_idx
  ON public.subscription_reminder_log(stripe_customer_id);

GRANT SELECT ON public.subscription_reminder_log TO authenticated;
GRANT ALL ON public.subscription_reminder_log TO service_role;

ALTER TABLE public.subscription_reminder_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users see their org's reminder log"
    ON public.subscription_reminder_log FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.stripe_subscriptions ss
        JOIN public.org_memberships om ON om.organization_id = ss.organization_id
        WHERE ss.stripe_customer_id = subscription_reminder_log.stripe_customer_id
          AND om.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
