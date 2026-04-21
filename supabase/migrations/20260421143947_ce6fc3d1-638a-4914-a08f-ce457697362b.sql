-- Add detailed requirements tracking columns to staff_payout_accounts
ALTER TABLE public.staff_payout_accounts 
  ADD COLUMN IF NOT EXISTS requirements_currently_due jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS requirements_pending_verification jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS disabled_reason text,
  ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_requirements_errors jsonb DEFAULT '[]'::jsonb;