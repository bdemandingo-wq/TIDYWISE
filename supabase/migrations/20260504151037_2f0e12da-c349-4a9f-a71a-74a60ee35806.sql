-- Idempotency table for Stripe webhook events
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write (no policies = locked down to service role bypass)
-- Explicit deny policy for authenticated users
CREATE POLICY "Block all client access to webhook events"
  ON public.stripe_webhook_events
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at 
  ON public.stripe_webhook_events(processed_at DESC);