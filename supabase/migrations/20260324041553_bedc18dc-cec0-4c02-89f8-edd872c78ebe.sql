
-- Booking link tracking table
CREATE TABLE public.booking_link_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  tracking_ref TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  link_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  link_opened_at TIMESTAMPTZ,
  booking_completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for lookups by tracking ref
CREATE UNIQUE INDEX idx_booking_link_tracking_ref ON public.booking_link_tracking(tracking_ref);
CREATE INDEX idx_booking_link_tracking_org ON public.booking_link_tracking(organization_id);
CREATE INDEX idx_booking_link_tracking_status ON public.booking_link_tracking(organization_id, status);

-- Enable RLS
ALTER TABLE public.booking_link_tracking ENABLE ROW LEVEL SECURITY;

-- RLS: org members can read/write
CREATE POLICY "Org members can view booking link tracking"
  ON public.booking_link_tracking FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "Org members can insert booking link tracking"
  ON public.booking_link_tracking FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "Org members can update booking link tracking"
  ON public.booking_link_tracking FOR UPDATE
  TO authenticated
  USING (public.is_org_member(organization_id));

-- Public can update link_opened_at (for tracking page visits)
CREATE POLICY "Anyone can update link opened status"
  ON public.booking_link_tracking FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Public can read by tracking_ref (for the public booking page)
CREATE POLICY "Anyone can read by tracking ref"
  ON public.booking_link_tracking FOR SELECT
  TO anon
  USING (true);
