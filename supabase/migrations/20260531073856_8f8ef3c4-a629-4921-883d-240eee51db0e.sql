CREATE TABLE public.stripe_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  plan TEXT,
  billing_interval TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  trial_end TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stripe_subscriptions_org ON public.stripe_subscriptions(organization_id);
CREATE INDEX idx_stripe_subscriptions_status ON public.stripe_subscriptions(status);

GRANT SELECT ON public.stripe_subscriptions TO authenticated;
GRANT ALL ON public.stripe_subscriptions TO service_role;

ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can view their subscription"
ON public.stripe_subscriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.org_memberships m
    WHERE m.organization_id = stripe_subscriptions.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
  )
);

CREATE TRIGGER trg_stripe_subscriptions_updated
BEFORE UPDATE ON public.stripe_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Returns true when the given org has an active paid plan in
-- stripe_subscriptions. Lifetime rows are stored here with
-- plan='lifetime' and current_period_end IS NULL.
CREATE OR REPLACE FUNCTION public.has_active_subscription(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stripe_subscriptions s
    WHERE s.organization_id = _org_id
      AND s.status IN ('active', 'trialing', 'past_due')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_subscription(UUID) TO authenticated, service_role;
