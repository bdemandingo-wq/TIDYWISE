
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS require_clockout_photos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_clockout_photos integer NOT NULL DEFAULT 2;
