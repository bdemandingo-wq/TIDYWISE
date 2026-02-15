
-- 1. Abandoned booking tracking table
CREATE TABLE public.abandoned_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  service_id UUID REFERENCES public.services(id),
  step_reached INTEGER DEFAULT 1,
  session_token TEXT NOT NULL,
  followup_sent BOOLEAN DEFAULT false,
  followup_sent_at TIMESTAMPTZ,
  converted BOOLEAN DEFAULT false,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.abandoned_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view abandoned bookings"
  ON public.abandoned_bookings FOR SELECT
  USING (organization_id IN (
    SELECT om.organization_id FROM public.org_memberships om WHERE om.user_id = auth.uid()
  ));

CREATE POLICY "Anyone can insert abandoned bookings"
  ON public.abandoned_bookings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Org admins can update abandoned bookings"
  ON public.abandoned_bookings FOR UPDATE
  USING (organization_id IN (
    SELECT om.organization_id FROM public.org_memberships om WHERE om.user_id = auth.uid()
  ));

CREATE POLICY "Org admins can delete abandoned bookings"
  ON public.abandoned_bookings FOR DELETE
  USING (organization_id IN (
    SELECT om.organization_id FROM public.org_memberships om WHERE om.user_id = auth.uid()
  ));

-- Trigger for updated_at
CREATE TRIGGER update_abandoned_bookings_updated_at
  BEFORE UPDATE ON public.abandoned_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add conversion tracking to campaign_sms_sends
ALTER TABLE public.campaign_sms_sends 
  ADD COLUMN IF NOT EXISTS converted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS campaign_type TEXT;

-- 3. Index for performance
CREATE INDEX idx_abandoned_bookings_org ON public.abandoned_bookings(organization_id);
CREATE INDEX idx_abandoned_bookings_session ON public.abandoned_bookings(session_token);
CREATE INDEX idx_abandoned_bookings_phone ON public.abandoned_bookings(phone);
CREATE INDEX idx_campaign_sms_sends_converted ON public.campaign_sms_sends(converted);
