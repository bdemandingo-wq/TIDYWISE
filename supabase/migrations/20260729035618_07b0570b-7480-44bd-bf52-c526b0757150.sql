ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS campaign_quiet_hours_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS campaign_quiet_hours_start smallint NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS campaign_quiet_hours_end smallint NOT NULL DEFAULT 9;

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_quiet_hours_start_range
    CHECK (campaign_quiet_hours_start >= 0 AND campaign_quiet_hours_start <= 23),
  ADD CONSTRAINT business_settings_quiet_hours_end_range
    CHECK (campaign_quiet_hours_end >= 0 AND campaign_quiet_hours_end <= 23);