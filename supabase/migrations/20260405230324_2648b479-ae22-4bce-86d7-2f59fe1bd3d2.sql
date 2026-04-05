CREATE TABLE IF NOT EXISTS public.demo_reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_booking_id UUID NOT NULL REFERENCES public.demo_bookings(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(demo_booking_id, reminder_type)
);