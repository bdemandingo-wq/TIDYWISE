CREATE TABLE IF NOT EXISTS public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_dispute_id text UNIQUE NOT NULL,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  stripe_customer_id text,
  customer_email text,
  amount_cents integer,
  currency text,
  reason text,
  status text,
  qualifies_for_ce3 boolean DEFAULT false,
  matching_prior_count integer DEFAULT 0,
  drafted_evidence jsonb DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  submitted_by uuid,
  outcome text,
  raw_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disputes_status_idx ON public.disputes(status);
CREATE INDEX IF NOT EXISTS disputes_customer_idx ON public.disputes(stripe_customer_id);

GRANT SELECT, UPDATE ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins view disputes"
  ON public.disputes FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "Platform admins update disputes"
  ON public.disputes FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin());

CREATE TRIGGER update_disputes_updated_at
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();