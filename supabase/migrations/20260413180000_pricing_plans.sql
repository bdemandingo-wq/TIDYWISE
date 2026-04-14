-- Add plan_type to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'trial'
    CHECK (plan_type IN ('trial', 'standard', 'lifetime', 'enterprise', 'free'));

-- Lifetime access purchases: one row per buyer, max 100 rows = 100 spots
CREATE TABLE IF NOT EXISTS public.lifetime_access_purchases (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id                UUID,
  email                  TEXT NOT NULL,
  stripe_session_id      TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  amount_cents           INTEGER DEFAULT 20000,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lifetime_access_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lifetime purchase"
  ON public.lifetime_access_purchases FOR SELECT
  USING (user_id = auth.uid());

-- Index so we can quickly count spots used
CREATE INDEX IF NOT EXISTS idx_lifetime_purchases_created
  ON public.lifetime_access_purchases (created_at);
