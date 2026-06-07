-- Stores Stripe subscriptions the webhook couldn't link to a TidyWise org.
--
-- Before: the lookup chain (Stripe customer → email → profiles → org)
-- silently dropped subscriptions when any step failed. Customers paid,
-- their Stripe sub showed active, but our DB had no stripe_subscriptions
-- row → has_active_subscription() returned false → they saw the paywall.
-- We only found out when a customer complained.
--
-- After: every silently-failed lookup writes a row here AND fires an
-- admin SMS. An operator can then run the fix-record SQL to manually
-- relink the subscription before the customer notices.

CREATE TABLE IF NOT EXISTS public.subscription_orphans (
  id BIGSERIAL PRIMARY KEY,
  stripe_subscription_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  stripe_event_id TEXT,
  stripe_event_type TEXT,
  customer_email TEXT,
  resolution_attempts JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_org_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_orphans_sub_idx
  ON public.subscription_orphans (stripe_subscription_id)
  WHERE resolved = false;

CREATE INDEX IF NOT EXISTS subscription_orphans_unresolved_idx
  ON public.subscription_orphans (created_at DESC) WHERE resolved = false;

ALTER TABLE public.subscription_orphans ENABLE ROW LEVEL SECURITY;

-- Service role only — this is operator-facing diagnostic data.
GRANT ALL ON public.subscription_orphans TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.subscription_orphans_id_seq TO service_role;
