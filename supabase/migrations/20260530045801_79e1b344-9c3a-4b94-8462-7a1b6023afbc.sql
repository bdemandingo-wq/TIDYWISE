ALTER TABLE public.score_companies
  ADD COLUMN IF NOT EXISTS claimed_user_id uuid;

CREATE INDEX IF NOT EXISTS score_companies_claimed_user_id_idx
  ON public.score_companies (claimed_user_id);

CREATE TABLE IF NOT EXISTS public.score_claim_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  company_slug text NOT NULL,
  user_id uuid NOT NULL,
  email text,
  ip_address text,
  user_agent text,
  source text NOT NULL DEFAULT 'self_serve_signup',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.score_claim_audit TO authenticated;
GRANT ALL ON public.score_claim_audit TO service_role;

ALTER TABLE public.score_claim_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own claim audit rows"
  ON public.score_claim_audit
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());