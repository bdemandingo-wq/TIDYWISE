-- ============================================================
-- Add referral_code to customers
-- Each customer gets a stable, unique referral code that can be
-- shown in the portal referral tab before they've ever made a
-- referral. Backfills from existing referral rows where available,
-- then generates from the customer UUID for the rest.
-- ============================================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

-- 1. Backfill from existing referral rows (use most recent code per customer)
UPDATE public.customers c
SET referral_code = r.referral_code
FROM (
  SELECT DISTINCT ON (referrer_customer_id)
    referrer_customer_id,
    referral_code
  FROM public.referrals
  ORDER BY referrer_customer_id, created_at DESC
) r
WHERE c.id = r.referrer_customer_id
  AND c.referral_code IS NULL;

-- 2. Generate a stable code for everyone else (first 8 chars of UUID, uppercase, no dashes)
UPDATE public.customers
SET referral_code = upper(left(replace(id::text, '-', ''), 8))
WHERE referral_code IS NULL;

-- 3. Enforce uniqueness and NOT NULL now that all rows are populated
--    Use ON CONFLICT DO NOTHING approach: if two customers got the same 8-char prefix
--    (astronomically unlikely with UUIDs but possible), append two more chars.
UPDATE public.customers
SET referral_code = upper(left(replace(id::text, '-', ''), 10))
WHERE referral_code IN (
  SELECT referral_code FROM public.customers GROUP BY referral_code HAVING count(*) > 1
);

ALTER TABLE public.customers
  ALTER COLUMN referral_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_referral_code
  ON public.customers(referral_code);

-- ============================================================
-- Trigger: auto-assign referral_code to new customers on INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_customer_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(left(replace(NEW.id::text, '-', ''), 8));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_customer_referral_code ON public.customers;
CREATE TRIGGER trg_set_customer_referral_code
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_referral_code();
