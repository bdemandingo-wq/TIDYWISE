-- Dedicated log table for renewal-reminder emails.
--
-- Previously these were tracked by inserting a marker row into
-- payment_evidence. That table is the source of truth for actual
-- charges and is the dataset the dispute pipeline reads to assemble
-- Visa CE 3.0 evidence — mixing "we sent an email" rows with "the
-- card was charged" rows pollutes the evidence pack, doubles
-- payment_evidence size for every active subscriber, and risks any
-- future query that joins/aggregates on payment_evidence treating
-- email-log rows as real charges.

CREATE TABLE IF NOT EXISTS public.subscription_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_subscription_id text NOT NULL,
  stripe_customer_id text,
  email text,
  period_end_sec bigint NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- One reminder per (sub, period). The function reads this index to
-- decide whether to skip a sub it's already reminded this cycle.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_reminder_log_unique_period
  ON public.subscription_reminder_log(stripe_subscription_id, period_end_sec);

CREATE INDEX IF NOT EXISTS subscription_reminder_log_customer_idx
  ON public.subscription_reminder_log(stripe_customer_id);

GRANT SELECT ON public.subscription_reminder_log TO authenticated;
GRANT ALL ON public.subscription_reminder_log TO service_role;

ALTER TABLE public.subscription_reminder_log ENABLE ROW LEVEL SECURITY;

-- Users can see their own reminder history (helps support: "did we
-- actually email you about this renewal?"). The join through
-- stripe_customer_id requires lookup against profiles.stripe_customer_id;
-- service_role bypasses RLS for the function itself.
CREATE POLICY "Users see their own reminder log"
  ON public.subscription_reminder_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.stripe_customer_id = subscription_reminder_log.stripe_customer_id
    )
  );
