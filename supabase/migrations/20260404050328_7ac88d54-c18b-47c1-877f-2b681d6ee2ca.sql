
-- Make stripe_secret_key nullable (for Stripe Connect flow where we store access_token instead)
ALTER TABLE public.org_stripe_settings ALTER COLUMN stripe_secret_key DROP NOT NULL;
ALTER TABLE public.org_stripe_settings ALTER COLUMN stripe_secret_key SET DEFAULT '';

-- Add Stripe Connect OAuth columns
ALTER TABLE public.org_stripe_settings ADD COLUMN IF NOT EXISTS stripe_access_token TEXT;
ALTER TABLE public.org_stripe_settings ADD COLUMN IF NOT EXISTS stripe_refresh_token TEXT;
ALTER TABLE public.org_stripe_settings ADD COLUMN IF NOT EXISTS stripe_user_email TEXT;
ALTER TABLE public.org_stripe_settings ADD COLUMN IF NOT EXISTS stripe_display_name TEXT;
ALTER TABLE public.org_stripe_settings ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.org_stripe_settings ADD COLUMN IF NOT EXISTS stripe_default_currency TEXT DEFAULT 'usd';
