-- Pricing override lock for Airbnb Turnover
-- Adds a per-row lock flag on service_pricing and a trigger that blocks
-- updates to locked rows unless the update explicitly unlocks them.

ALTER TABLE public.service_pricing
  ADD COLUMN IF NOT EXISTS pricing_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pricing_lock_reason text;

CREATE OR REPLACE FUNCTION public.enforce_service_pricing_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- If row is currently locked AND the update is NOT explicitly unlocking it,
  -- block any change to the price-related fields.
  IF COALESCE(OLD.pricing_locked, false) = true
     AND COALESCE(NEW.pricing_locked, true) = true THEN
    IF NEW.sqft_prices IS DISTINCT FROM OLD.sqft_prices
       OR NEW.minimum_price IS DISTINCT FROM OLD.minimum_price THEN
      RAISE EXCEPTION 'Pricing for service % is locked (%). Unlock pricing_locked=false in the same update to modify it.',
        OLD.service_id, COALESCE(OLD.pricing_lock_reason, 'no reason provided');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_service_pricing_lock ON public.service_pricing;
CREATE TRIGGER trg_enforce_service_pricing_lock
BEFORE UPDATE ON public.service_pricing
FOR EACH ROW
EXECUTE FUNCTION public.enforce_service_pricing_lock();

-- Lock current Airbnb Turnover pricing for this organization
UPDATE public.service_pricing
SET pricing_locked = true,
    pricing_lock_reason = 'Airbnb Turnover pricing protected per owner request'
WHERE organization_id = 'e95b92d0-7099-408e-a773-e4407b34f8b4'
  AND service_id = 'aa9f94a6-a494-4d5b-81b6-86793df503e3';