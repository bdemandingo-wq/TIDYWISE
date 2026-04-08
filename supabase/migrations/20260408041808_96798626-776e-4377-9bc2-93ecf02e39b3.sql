
CREATE TABLE public.tos_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  ip_address TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tos_version TEXT NOT NULL DEFAULT '2025-02-01'
);

ALTER TABLE public.tos_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own TOS acceptance"
ON public.tos_acceptances FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own TOS acceptance"
ON public.tos_acceptances FOR SELECT
TO authenticated
USING (user_id = auth.uid());
