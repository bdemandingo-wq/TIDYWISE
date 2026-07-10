ALTER TABLE public.organization_notification_preferences
  ADD COLUMN IF NOT EXISTS notification_matrix JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snoozed_until JSONB NOT NULL DEFAULT '{}'::jsonb;