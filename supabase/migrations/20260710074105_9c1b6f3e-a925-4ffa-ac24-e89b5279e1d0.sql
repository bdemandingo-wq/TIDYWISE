
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS confirmation_email_sections JSONB,
  ADD COLUMN IF NOT EXISTS reminder_email_sections JSONB;
