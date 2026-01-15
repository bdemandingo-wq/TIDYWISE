-- Add delivery_status field to sms_messages for read receipts
ALTER TABLE public.sms_messages 
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending';

-- Add delivered_at timestamp for tracking when messages were delivered
ALTER TABLE public.sms_messages 
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

-- Add campaign_type for seasonal promos
ALTER TABLE public.automated_campaigns 
DROP CONSTRAINT IF EXISTS automated_campaigns_type_check;

ALTER TABLE public.automated_campaigns 
ADD CONSTRAINT automated_campaigns_type_check 
CHECK (type IN ('inactive_customer', 'post_service', 'birthday', 'seasonal_promo', 'win_back', 'custom'));

-- Create table for tracking campaign sends to avoid duplicates
CREATE TABLE IF NOT EXISTS public.campaign_sms_sends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.automated_campaigns(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT DEFAULT 'sent',
  phone_number TEXT,
  message_content TEXT,
  UNIQUE(campaign_id, customer_id)
);

-- Enable RLS
ALTER TABLE public.campaign_sms_sends ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their organization's campaign sends"
ON public.campaign_sms_sends
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert campaign sends for their organization"
ON public.campaign_sms_sends
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.org_memberships WHERE user_id = auth.uid()
  )
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_campaign_sms_sends_customer ON public.campaign_sms_sends(customer_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sms_sends_campaign ON public.campaign_sms_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_delivery_status ON public.sms_messages(delivery_status);
CREATE INDEX IF NOT EXISTS idx_sms_messages_openphone_id ON public.sms_messages(openphone_message_id);