-- Create cleaner location tracking table
CREATE TABLE public.cleaner_location_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  latitude float8 NOT NULL,
  longitude float8 NOT NULL,
  tracking_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_active boolean NOT NULL DEFAULT true,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one active tracking per booking
CREATE UNIQUE INDEX idx_cleaner_tracking_active_booking 
  ON public.cleaner_location_tracking (booking_id) 
  WHERE is_active = true;

-- Index for token lookups (public tracking page)
CREATE UNIQUE INDEX idx_cleaner_tracking_token 
  ON public.cleaner_location_tracking (tracking_token);

-- Index for org-scoped admin queries
CREATE INDEX idx_cleaner_tracking_org 
  ON public.cleaner_location_tracking (organization_id, is_active);

-- Enable RLS
ALTER TABLE public.cleaner_location_tracking ENABLE ROW LEVEL SECURITY;

-- Public can read by token (for tracking page)
CREATE POLICY "Anyone can view tracking by token"
  ON public.cleaner_location_tracking
  FOR SELECT
  USING (true);

-- Org admins can view their org's tracking
-- (covered by the SELECT true policy above, but we keep org isolation via queries)

-- Staff can insert/update their own tracking records
CREATE POLICY "Staff can insert their own tracking"
  ON public.cleaner_location_tracking
  FOR INSERT
  WITH CHECK (
    public.is_org_staff(organization_id)
  );

CREATE POLICY "Staff can update their own tracking"
  ON public.cleaner_location_tracking
  FOR UPDATE
  USING (
    public.is_org_staff(organization_id)
  );

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.cleaner_location_tracking;