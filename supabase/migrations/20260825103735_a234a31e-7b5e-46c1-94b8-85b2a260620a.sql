DROP POLICY IF EXISTS "Anyone can insert claim_requests" ON public.score_claim_requests;

CREATE POLICY "Anyone can submit pending claim_requests"
ON public.score_claim_requests
FOR INSERT
WITH CHECK (
  coalesce(status, 'pending') = 'pending'
  AND approved_organization_id IS NULL
);