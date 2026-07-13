
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS scheduling_mode text NOT NULL DEFAULT 'specific',
  ADD COLUMN IF NOT EXISTS arrival_windows jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_scheduling_mode_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_scheduling_mode_check
  CHECK (scheduling_mode IN ('specific','arrival_window'));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_arrival_window boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arrival_window_start time,
  ADD COLUMN IF NOT EXISTS arrival_window_end time;
