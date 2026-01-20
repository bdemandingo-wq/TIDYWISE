-- Allow additional recurring frequencies (triweekly + anyday)
-- Needed for Airbnb clients that do not have a fixed weekday.

ALTER TABLE public.recurring_bookings
  DROP CONSTRAINT IF EXISTS recurring_bookings_frequency_check;

ALTER TABLE public.recurring_bookings
  ADD CONSTRAINT recurring_bookings_frequency_check
  CHECK (frequency IN ('weekly', 'biweekly', 'triweekly', 'monthly', 'anyday'));
