ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS actual_hours_worked numeric,
  ADD COLUMN IF NOT EXISTS hours_basis text
    CHECK (hours_basis IS NULL OR hours_basis IN ('clock','unknown','absent')),
  ADD COLUMN IF NOT EXISTS hours_capped_at numeric;

COMMENT ON COLUMN public.bookings.actual_hours_worked IS
  'Worked hours from cleaner_checkin_at/cleaner_checkout_at, written once at completion.';
COMMENT ON COLUMN public.bookings.hours_capped_at IS
  'Capped hours figure when actual exceeded the cap and pay was limited to it. NULL = not capped.';

ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS hours_overage_cap_ratio numeric NOT NULL DEFAULT 1.25
    CHECK (hours_overage_cap_ratio >= 1),
  ADD COLUMN IF NOT EXISTS hours_absolute_ceiling numeric NOT NULL DEFAULT 12
    CHECK (hours_absolute_ceiling > 0);
