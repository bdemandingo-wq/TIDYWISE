ALTER TABLE public.client_tier_settings
  ADD COLUMN IF NOT EXISTS discount_percent numeric NOT NULL DEFAULT 0
  CHECK (discount_percent >= 0 AND discount_percent < 100);

COMMENT ON COLUMN public.client_tier_settings.discount_percent IS
  'Machine-readable tier discount. The benefits JSONB is marketing copy and is NOT parsed — an org sets this explicitly. 0 means no automatic discount.';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS loyalty_tier text;

COMMENT ON COLUMN public.bookings.loyalty_tier IS
  'The tier resolve_customer_tier() returned when this booking was created. Historical record — tiers move as spend accrues, so re-resolving later would not reproduce it. Never read for pricing.';