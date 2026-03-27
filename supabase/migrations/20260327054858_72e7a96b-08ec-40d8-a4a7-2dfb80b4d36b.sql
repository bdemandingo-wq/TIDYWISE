
-- Add subscription fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
ADD COLUMN IF NOT EXISTS billing_cycle text DEFAULT 'monthly';

-- Set trial_ends_at for existing profiles that don't have it
UPDATE public.profiles
SET trial_ends_at = created_at + interval '60 days'
WHERE trial_ends_at IS NULL;

-- Create a validation trigger for subscription_tier
CREATE OR REPLACE FUNCTION public.validate_subscription_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.subscription_tier NOT IN ('starter', 'pro', 'business') THEN
    RAISE EXCEPTION 'Invalid subscription_tier: %', NEW.subscription_tier;
  END IF;
  IF NEW.subscription_status NOT IN ('trial', 'active', 'cancelled', 'past_due') THEN
    RAISE EXCEPTION 'Invalid subscription_status: %', NEW.subscription_status;
  END IF;
  IF NEW.billing_cycle IS NOT NULL AND NEW.billing_cycle NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'Invalid billing_cycle: %', NEW.billing_cycle;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_subscription_fields_trigger ON public.profiles;
CREATE TRIGGER validate_subscription_fields_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_subscription_fields();
