-- Add resend_api_key to business_settings for per-organization email sending
ALTER TABLE public.business_settings 
ADD COLUMN IF NOT EXISTS resend_api_key text;