ALTER TABLE public.recurring_bookings DROP CONSTRAINT recurring_bookings_frequency_check;
ALTER TABLE public.recurring_bookings ADD CONSTRAINT recurring_bookings_frequency_check 
  CHECK (frequency = ANY (ARRAY['weekly','biweekly','triweekly','monthly','anyday','custom']));