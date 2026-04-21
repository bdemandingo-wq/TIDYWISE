
ALTER TABLE public.stripe_requirement_notifications
  ADD COLUMN IF NOT EXISTS in_app_notified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banner_shown boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS detected_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.staff_payout_accounts
  ADD COLUMN IF NOT EXISTS payout_resolved_toast_shown boolean NOT NULL DEFAULT false;
