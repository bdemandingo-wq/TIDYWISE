
ALTER TABLE public.organization_sms_settings
  ADD COLUMN IF NOT EXISTS notify_admin_arrived boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_client_arrived boolean NOT NULL DEFAULT true;

ALTER TABLE public.cleaner_location_tracking
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS location_permission_status text,
  ADD COLUMN IF NOT EXISTS location_permission_updated_at timestamptz;
