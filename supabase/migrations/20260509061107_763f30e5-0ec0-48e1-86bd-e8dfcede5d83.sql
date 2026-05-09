ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_category TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_bookings_cancelled_at ON public.bookings(cancelled_at) WHERE cancelled_at IS NOT NULL;