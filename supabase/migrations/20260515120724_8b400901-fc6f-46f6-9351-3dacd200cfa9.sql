ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS notify_evening_brief boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_morning_brief boolean NOT NULL DEFAULT true;