ALTER TABLE public.organization_sms_settings
ADD COLUMN IF NOT EXISTS notify_client_distance_eta boolean NOT NULL DEFAULT true;