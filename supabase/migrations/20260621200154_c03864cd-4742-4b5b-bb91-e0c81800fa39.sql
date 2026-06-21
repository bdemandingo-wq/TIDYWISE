ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_unsubscribed boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_unsubscribed_at timestamptz;