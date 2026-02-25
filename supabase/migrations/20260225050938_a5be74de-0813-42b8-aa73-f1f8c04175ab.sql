
CREATE TABLE IF NOT EXISTS public.facebook_lead_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  payload JSONB
);

ALTER TABLE public.facebook_lead_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only org admins can view webhook events"
ON public.facebook_lead_webhook_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  )
);
