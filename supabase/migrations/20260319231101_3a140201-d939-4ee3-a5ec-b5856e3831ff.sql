
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS payroll_frequency text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS payroll_start_day integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payroll_custom_days integer[] DEFAULT NULL;
