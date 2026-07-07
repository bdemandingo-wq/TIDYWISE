
-- 1. plan_tier column on organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'trial'
    CHECK (plan_tier IN ('trial','basic','pro','custom'));

-- Promote existing lifetime/grandfathered orgs to custom
UPDATE public.organizations
   SET plan_tier = 'custom'
 WHERE plan_type = 'lifetime' OR grandfathered_lifetime = true;

-- 2. Daily usage counter (UTC-bucketed)
CREATE TABLE public.ai_usage_daily (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, usage_date)
);
CREATE INDEX idx_ai_usage_daily_date ON public.ai_usage_daily (usage_date);

GRANT ALL ON public.ai_usage_daily TO service_role;
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;
-- No user-facing policies: read via SECURITY DEFINER RPCs only.

-- 3. Purchased credit ledger
CREATE TABLE public.ai_credit_ledger (
  organization_id UUID NOT NULL PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_credit_ledger TO service_role;
ALTER TABLE public.ai_credit_ledger ENABLE ROW LEVEL SECURITY;

-- 4. Ledger audit entries
CREATE TABLE public.ai_credit_ledger_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_credit_entries_org ON public.ai_credit_ledger_entries (organization_id, created_at DESC);

GRANT ALL ON public.ai_credit_ledger_entries TO service_role;
ALTER TABLE public.ai_credit_ledger_entries ENABLE ROW LEVEL SECURITY;

-- 5. Stripe session idempotency guard
CREATE TABLE public.ai_credit_processed_sessions (
  stripe_session_id TEXT NOT NULL PRIMARY KEY,
  organization_id UUID NOT NULL,
  credits INTEGER NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_credit_processed_sessions TO service_role;
ALTER TABLE public.ai_credit_processed_sessions ENABLE ROW LEVEL SECURITY;

-- 6. Helper: map plan_tier -> daily limit
CREATE OR REPLACE FUNCTION public.ai_daily_limit_for_tier(_tier TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _tier
    WHEN 'custom' THEN 250
    WHEN 'pro'   THEN 100
    WHEN 'basic' THEN 25
    ELSE 10  -- trial or unknown
  END;
$$;

-- 7. Status RPC
CREATE OR REPLACE FUNCTION public.get_ai_credit_status(_org_id UUID)
RETURNS TABLE (
  used_today INTEGER,
  daily_limit INTEGER,
  purchased_balance INTEGER,
  resets_at TIMESTAMPTZ,
  plan_tier TEXT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier TEXT;
  v_today DATE;
BEGIN
  SELECT o.plan_tier INTO v_tier FROM public.organizations o WHERE o.id = _org_id;
  IF v_tier IS NULL THEN v_tier := 'trial'; END IF;

  v_today := (now() AT TIME ZONE 'UTC')::DATE;

  RETURN QUERY
  SELECT
    COALESCE((SELECT credits_used FROM public.ai_usage_daily
              WHERE organization_id = _org_id AND usage_date = v_today), 0),
    public.ai_daily_limit_for_tier(v_tier),
    COALESCE((SELECT balance FROM public.ai_credit_ledger WHERE organization_id = _org_id), 0),
    ((v_today + INTERVAL '1 day') AT TIME ZONE 'UTC')::TIMESTAMPTZ,
    v_tier;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ai_credit_status(UUID) TO service_role, authenticated;

-- 8. Atomic consume RPC — daily allowance first, then purchased balance.
CREATE OR REPLACE FUNCTION public.consume_ai_credit(_org_id UUID)
RETURNS TABLE (
  allowed BOOLEAN,
  used_today INTEGER,
  daily_limit INTEGER,
  purchased_balance INTEGER,
  resets_at TIMESTAMPTZ,
  source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier TEXT;
  v_limit INTEGER;
  v_today DATE;
  v_new_used INTEGER;
  v_new_balance INTEGER;
  v_current_balance INTEGER;
BEGIN
  SELECT o.plan_tier INTO v_tier FROM public.organizations o WHERE o.id = _org_id;
  IF v_tier IS NULL THEN v_tier := 'trial'; END IF;

  v_limit := public.ai_daily_limit_for_tier(v_tier);
  v_today := (now() AT TIME ZONE 'UTC')::DATE;

  -- Step 1: Atomically increment today's counter and get the resulting value.
  INSERT INTO public.ai_usage_daily (organization_id, usage_date, credits_used)
  VALUES (_org_id, v_today, 1)
  ON CONFLICT (organization_id, usage_date)
  DO UPDATE SET credits_used = public.ai_usage_daily.credits_used + 1,
                updated_at = now()
  RETURNING credits_used INTO v_new_used;

  -- Within daily allowance -> allowed.
  IF v_new_used <= v_limit THEN
    RETURN QUERY SELECT
      TRUE,
      v_new_used,
      v_limit,
      COALESCE((SELECT balance FROM public.ai_credit_ledger WHERE organization_id = _org_id), 0),
      ((v_today + INTERVAL '1 day') AT TIME ZONE 'UTC')::TIMESTAMPTZ,
      'daily'::TEXT;
    RETURN;
  END IF;

  -- Step 2: Daily used up. Try to atomically decrement purchased balance.
  UPDATE public.ai_credit_ledger
     SET balance = balance - 1, updated_at = now()
   WHERE organization_id = _org_id AND balance > 0
  RETURNING balance INTO v_new_balance;

  IF FOUND THEN
    -- Log the spend
    INSERT INTO public.ai_credit_ledger_entries (organization_id, delta, reason)
    VALUES (_org_id, -1, 'ai_action_spend');

    RETURN QUERY SELECT
      TRUE,
      v_new_used,
      v_limit,
      v_new_balance,
      ((v_today + INTERVAL '1 day') AT TIME ZONE 'UTC')::TIMESTAMPTZ,
      'purchased'::TEXT;
    RETURN;
  END IF;

  -- Step 3: Neither daily nor purchased available. Roll back the daily increment
  -- so the denied attempt doesn't burn a credit the org didn't spend.
  UPDATE public.ai_usage_daily
     SET credits_used = GREATEST(0, credits_used - 1),
         updated_at = now()
   WHERE organization_id = _org_id AND usage_date = v_today;

  SELECT COALESCE(balance, 0) INTO v_current_balance
    FROM public.ai_credit_ledger WHERE organization_id = _org_id;

  RETURN QUERY SELECT
    FALSE,
    v_limit,          -- report as "used = limit" so UI shows N/N
    v_limit,
    COALESCE(v_current_balance, 0),
    ((v_today + INTERVAL '1 day') AT TIME ZONE 'UTC')::TIMESTAMPTZ,
    'none'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_ai_credit(UUID) TO service_role;

-- 9. Credit purchase RPC — idempotent by stripe_session_id.
CREATE OR REPLACE FUNCTION public.credit_ai_purchase(
  _org_id UUID,
  _amount INTEGER,
  _stripe_session_id TEXT,
  _reason TEXT DEFAULT 'stripe_purchase'
)
RETURNS TABLE (already_processed BOOLEAN, new_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted BOOLEAN;
  v_balance INTEGER;
BEGIN
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive, got %', _amount;
  END IF;

  -- Idempotency guard: only the first insert wins.
  INSERT INTO public.ai_credit_processed_sessions (stripe_session_id, organization_id, credits)
  VALUES (_stripe_session_id, _org_id, _amount)
  ON CONFLICT (stripe_session_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT balance INTO v_balance FROM public.ai_credit_ledger WHERE organization_id = _org_id;
    RETURN QUERY SELECT TRUE, COALESCE(v_balance, 0);
    RETURN;
  END IF;

  -- Upsert balance
  INSERT INTO public.ai_credit_ledger (organization_id, balance)
  VALUES (_org_id, _amount)
  ON CONFLICT (organization_id)
  DO UPDATE SET balance = public.ai_credit_ledger.balance + _amount,
                updated_at = now()
  RETURNING balance INTO v_balance;

  INSERT INTO public.ai_credit_ledger_entries (organization_id, delta, reason, stripe_session_id)
  VALUES (_org_id, _amount, _reason, _stripe_session_id);

  RETURN QUERY SELECT FALSE, v_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_ai_purchase(UUID, INTEGER, TEXT, TEXT) TO service_role;

-- 10. Onboarding grant trigger: 50 credits when an org is created.
CREATE OR REPLACE FUNCTION public.grant_trial_onboarding_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ai_credit_ledger (organization_id, balance)
  VALUES (NEW.id, 50)
  ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO public.ai_credit_ledger_entries (organization_id, delta, reason)
  VALUES (NEW.id, 50, 'trial_onboarding_grant');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_trial_onboarding ON public.organizations;
CREATE TRIGGER trg_grant_trial_onboarding
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.grant_trial_onboarding_credits();

-- Backfill the 50-credit onboarding grant for existing orgs that don't have a ledger row yet.
INSERT INTO public.ai_credit_ledger (organization_id, balance)
SELECT o.id, 50
  FROM public.organizations o
  LEFT JOIN public.ai_credit_ledger l ON l.organization_id = o.id
 WHERE l.organization_id IS NULL
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO public.ai_credit_ledger_entries (organization_id, delta, reason)
SELECT o.id, 50, 'trial_onboarding_grant_backfill'
  FROM public.organizations o
  JOIN public.ai_credit_ledger l ON l.organization_id = o.id
 WHERE l.balance >= 50
   AND NOT EXISTS (
     SELECT 1 FROM public.ai_credit_ledger_entries e
      WHERE e.organization_id = o.id AND e.reason IN ('trial_onboarding_grant','trial_onboarding_grant_backfill')
   );
