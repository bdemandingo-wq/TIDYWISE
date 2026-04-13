
ALTER TABLE public.organization_sms_settings
  ADD COLUMN IF NOT EXISTS notify_admin_on_the_way boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_client_on_the_way boolean NOT NULL DEFAULT true;
