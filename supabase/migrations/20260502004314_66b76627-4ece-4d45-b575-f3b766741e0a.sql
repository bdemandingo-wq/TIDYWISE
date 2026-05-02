ALTER TABLE public.recurring_offer_queue
  DROP CONSTRAINT IF EXISTS recurring_offer_queue_booking_id_fkey;

ALTER TABLE public.recurring_offer_queue
  ADD CONSTRAINT recurring_offer_queue_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;