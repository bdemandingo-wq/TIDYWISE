ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS surge_weekend_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS surge_weekend_multiplier NUMERIC NOT NULL DEFAULT 1.15,
  ADD COLUMN IF NOT EXISTS surge_lastminute_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS surge_lastminute_hours INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS surge_lastminute_multiplier NUMERIC NOT NULL DEFAULT 1.20,
  ADD COLUMN IF NOT EXISTS surge_holiday_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS surge_holiday_multiplier NUMERIC NOT NULL DEFAULT 1.25,
  ADD COLUMN IF NOT EXISTS recurring_discount_one_time NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurring_discount_weekly NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurring_discount_biweekly NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurring_discount_monthly NUMERIC NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';