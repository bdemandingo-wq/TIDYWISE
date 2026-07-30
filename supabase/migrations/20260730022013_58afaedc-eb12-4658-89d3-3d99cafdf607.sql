ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS recurring_booking_id uuid
  REFERENCES public.recurring_bookings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.bookings.recurring_booking_id IS
  'Set only by the admin Recurring Bookings generator. Not settable from the public booking form or any webhook path. Used as the exemption signal for the minimum-price floor trigger.';

CREATE INDEX IF NOT EXISTS idx_bookings_recurring_booking_id
  ON public.bookings(recurring_booking_id)
  WHERE recurring_booking_id IS NOT NULL;