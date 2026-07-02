
-- 1) Fix RecurringDiscountSettings save: upsert requires a unique constraint on organization_id
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_organization_id_key UNIQUE (organization_id);

-- 2) Allow custom recurring frequencies to carry their own discount percentage (0-99)
ALTER TABLE public.custom_frequencies
  ADD COLUMN IF NOT EXISTS discount_pct integer NOT NULL DEFAULT 0;

ALTER TABLE public.custom_frequencies
  ADD CONSTRAINT custom_frequencies_discount_pct_range
  CHECK (discount_pct >= 0 AND discount_pct <= 99);
