
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cleaner_pay_expected numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pay_locked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pay_last_saved_at timestamptz DEFAULT NULL;
