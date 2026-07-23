ALTER TABLE public.booking_reminder_log
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE INDEX IF NOT EXISTS idx_booking_reminder_log_org_status_sent_at
  ON public.booking_reminder_log (organization_id, status, sent_at DESC);