
-- Add campaign_id to booking_link_tracking for campaign association
ALTER TABLE public.booking_link_tracking 
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.automated_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booking_link_tracking_campaign ON public.booking_link_tracking(campaign_id);
