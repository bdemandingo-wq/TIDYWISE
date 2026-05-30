
-- Cancellation feedback (one row per confirmed cancellation)
CREATE TABLE public.cancellation_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID,
  user_id UUID NOT NULL,
  user_email TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  reason TEXT NOT NULL,
  competitor_name TEXT,
  missing_feature TEXT,
  feedback_text TEXT,
  plan TEXT,
  canceled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end_date TIMESTAMPTZ,
  eligible_for_winback BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cancellation_feedback_org ON public.cancellation_feedback(organization_id);
CREATE INDEX idx_cancellation_feedback_canceled_at ON public.cancellation_feedback(canceled_at);
CREATE INDEX idx_cancellation_feedback_reason ON public.cancellation_feedback(reason);

GRANT SELECT, INSERT ON public.cancellation_feedback TO authenticated;
GRANT ALL ON public.cancellation_feedback TO service_role;

ALTER TABLE public.cancellation_feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own cancellation feedback
CREATE POLICY "Users can insert their own cancellation feedback"
ON public.cancellation_feedback
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can view their own cancellation feedback
CREATE POLICY "Users can view their own cancellation feedback"
ON public.cancellation_feedback
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);


-- Subscription pauses
CREATE TABLE public.subscription_pauses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID,
  user_id UUID NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT NOT NULL,
  paused_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resume_date TIMESTAMPTZ NOT NULL,
  pause_months INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'resumed' | 'canceled'
  resumed_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscription_pauses_org ON public.subscription_pauses(organization_id);
CREATE INDEX idx_subscription_pauses_status ON public.subscription_pauses(status);
CREATE INDEX idx_subscription_pauses_resume_date ON public.subscription_pauses(resume_date);

GRANT SELECT, INSERT ON public.subscription_pauses TO authenticated;
GRANT ALL ON public.subscription_pauses TO service_role;

ALTER TABLE public.subscription_pauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own subscription pauses"
ON public.subscription_pauses
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own subscription pauses"
ON public.subscription_pauses
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);


-- Winback offers (one per org, ever)
CREATE TABLE public.winback_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID,
  user_id UUID NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  offer_type TEXT NOT NULL,      -- e.g. 'one_month_free', 'half_off_three_months'
  coupon_id TEXT,                -- the Stripe coupon used
  shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'shown', -- 'shown' | 'claimed' | 'declined'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One offer per org, ever. If org_id is null fall back to user.
  UNIQUE (user_id)
);
CREATE INDEX idx_winback_offers_org ON public.winback_offers(organization_id);
CREATE INDEX idx_winback_offers_status ON public.winback_offers(status);

GRANT SELECT, INSERT ON public.winback_offers TO authenticated;
GRANT ALL ON public.winback_offers TO service_role;

ALTER TABLE public.winback_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own winback offer"
ON public.winback_offers
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own winback offer"
ON public.winback_offers
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);


-- Platform-level settings (key/value). Used for retention/winback offer config.
CREATE TABLE public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read settings; writes only via service role (edge functions / admin).
CREATE POLICY "Authenticated can read platform settings"
ON public.platform_settings
FOR SELECT
TO authenticated
USING (true);

-- Seed the winback offer setting
INSERT INTO public.platform_settings (key, value)
VALUES (
  'winback_offer',
  jsonb_build_object(
    'offer_type', 'one_month_free',
    'percent_off', 100,
    'duration', 'once',
    'duration_in_months', null,
    'label', '1 month free'
  )
)
ON CONFLICT (key) DO NOTHING;
