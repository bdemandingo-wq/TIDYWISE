-- 1) payment_evidence table
CREATE TABLE IF NOT EXISTS public.payment_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  organization_id uuid,
  email text NOT NULL,
  stripe_customer_id text,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  stripe_subscription_id text,
  amount_cents integer,
  currency text,
  ip_address text,
  user_agent text,
  device_fingerprint text,
  signup_date timestamptz,
  tos_accepted boolean DEFAULT false,
  tos_version text,
  tos_accepted_at timestamptz,
  three_d_secure_status text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_evidence_pi_unique
  ON public.payment_evidence(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_evidence_customer_idx
  ON public.payment_evidence(stripe_customer_id);
CREATE INDEX IF NOT EXISTS payment_evidence_email_idx
  ON public.payment_evidence(email);
CREATE INDEX IF NOT EXISTS payment_evidence_user_idx
  ON public.payment_evidence(user_id);

GRANT SELECT ON public.payment_evidence TO authenticated;
GRANT ALL ON public.payment_evidence TO service_role;

ALTER TABLE public.payment_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own payment evidence"
  ON public.payment_evidence FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2) extend tos_acceptances
ALTER TABLE public.tos_acceptances
  ADD COLUMN IF NOT EXISTS accepted boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS user_agent text;

-- 3) daily cron for renewal reminders (3 days before renewal)
DO $$ BEGIN
  PERFORM cron.unschedule('send-subscription-renewal-reminder');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'send-subscription-renewal-reminder',
  '0 14 * * *',  -- daily at 14:00 UTC
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/send-subscription-renewal-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);