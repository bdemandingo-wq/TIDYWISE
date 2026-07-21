-- Restores 7 tables declared in earlier migrations but never landed in the live DB.
-- All idempotent (IF NOT EXISTS / DROP...IF EXISTS).

-- 1. automation_fire_log
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

-- 2. device_push_tokens
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
    ON public.device_push_tokens FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Service role full access to push tokens"
    ON public.device_push_tokens FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_push_tokens_org ON public.device_push_tokens(organization_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.device_push_tokens(user_id);

-- 3. custom_work_requests
CREATE TABLE IF NOT EXISTS public.custom_work_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('website_build','sms_setup','email_marketing_setup','customer_import','scripts_documents_pack','something_else')),
  details text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','in_progress','completed','declined','cancelled')),
  declined_reason text,
  admin_notes text,
  billing_period_start timestamptz NOT NULL,
  billing_period_end timestamptz NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custom_work_requests_org_idx ON public.custom_work_requests(organization_id);
CREATE INDEX IF NOT EXISTS custom_work_requests_status_idx ON public.custom_work_requests(status);
CREATE INDEX IF NOT EXISTS custom_work_requests_period_idx ON public.custom_work_requests(organization_id, billing_period_start);
GRANT SELECT, INSERT ON public.custom_work_requests TO authenticated;
GRANT ALL ON public.custom_work_requests TO service_role;
ALTER TABLE public.custom_work_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users see their org's requests"
    ON public.custom_work_requests FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.org_memberships WHERE org_memberships.user_id = auth.uid() AND org_memberships.organization_id = custom_work_requests.organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users submit requests for their org"
    ON public.custom_work_requests FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.org_memberships WHERE org_memberships.user_id = auth.uid() AND org_memberships.organization_id = custom_work_requests.organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. ad_management_subscriptions
CREATE TABLE IF NOT EXISTS public.ad_management_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('google_search','google_lsa','facebook')),
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  stripe_price_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','cancelled','paused')),
  monthly_amount_cents integer NOT NULL DEFAULT 40000,
  started_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_mgmt_org_idx ON public.ad_management_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS ad_mgmt_status_idx ON public.ad_management_subscriptions(status);
CREATE UNIQUE INDEX IF NOT EXISTS ad_mgmt_one_active_per_platform ON public.ad_management_subscriptions(organization_id, platform) WHERE status = 'active';
GRANT SELECT ON public.ad_management_subscriptions TO authenticated;
GRANT ALL ON public.ad_management_subscriptions TO service_role;
ALTER TABLE public.ad_management_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users see their org's ad subs"
    ON public.ad_management_subscriptions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.org_memberships WHERE org_memberships.user_id = auth.uid() AND org_memberships.organization_id = ad_management_subscriptions.organization_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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

-- 5. booking_checkins
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

-- 6. winback_drip_log
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

-- 7. subscription_reminder_log
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
    ON public.subscription_reminder_log FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.stripe_subscriptions ss JOIN public.org_memberships om ON om.organization_id = ss.organization_id WHERE ss.stripe_customer_id = subscription_reminder_log.stripe_customer_id AND om.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;