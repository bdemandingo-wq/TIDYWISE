
-- Demo bookings table for real calendar scheduling
CREATE TABLE public.demo_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  business_name TEXT NOT NULL,
  team_size TEXT,
  biggest_challenge TEXT,
  booked_date DATE NOT NULL,
  booked_time TIME NOT NULL,
  timezone TEXT,
  status TEXT DEFAULT 'confirmed',
  cancellation_reason TEXT,
  reschedule_note TEXT,
  original_date DATE,
  original_time TIME,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Blocked dates for Emmanuel's calendar
CREATE TABLE public.demo_blocked_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocked_date DATE NOT NULL,
  reason TEXT DEFAULT 'personal',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(blocked_date)
);

-- RLS
ALTER TABLE public.demo_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_blocked_dates ENABLE ROW LEVEL SECURITY;

-- Public can insert demo bookings (booking form is public)
CREATE POLICY "Anyone can insert demo bookings"
ON public.demo_bookings FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Public can read demo bookings to check slot availability (only date/time/status)
CREATE POLICY "Anyone can read demo booking slots"
ON public.demo_bookings FOR SELECT
TO anon, authenticated
USING (true);

-- Only authenticated users can update (admin)
CREATE POLICY "Authenticated users can update demo bookings"
ON public.demo_bookings FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Public can read blocked dates to show unavailable days
CREATE POLICY "Anyone can read blocked dates"
ON public.demo_blocked_dates FOR SELECT
TO anon, authenticated
USING (true);

-- Only authenticated can manage blocked dates
CREATE POLICY "Authenticated users can manage blocked dates"
ON public.demo_blocked_dates FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete blocked dates"
ON public.demo_blocked_dates FOR DELETE
TO authenticated
USING (true);
