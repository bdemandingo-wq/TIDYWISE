ALTER TABLE public.booking_link_tracking ADD COLUMN IF NOT EXISTS link_type text NOT NULL DEFAULT 'booking';

-- Backfill existing card collection links: any record inserted by send-card-link-sms
-- won't have a campaign_id and the tracking_ref pattern differs, but we can't distinguish perfectly.
-- Instead, we'll leave existing data as 'booking' (the default) and fix going forward.

COMMENT ON COLUMN public.booking_link_tracking.link_type IS 'Type of link: booking, card_collection, deposit, review, tip';