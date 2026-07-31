
ALTER TABLE public.billing_events
  ADD COLUMN IF NOT EXISTS revenue_stream_corrected text,
  ADD COLUMN IF NOT EXISTS correction_basis text,
  ADD COLUMN IF NOT EXISTS correction_confidence text,
  ADD COLUMN IF NOT EXISTS corrected_at timestamptz;

ALTER TABLE public.billing_events
  DROP CONSTRAINT IF EXISTS billing_events_revenue_stream_corrected_chk;
ALTER TABLE public.billing_events
  ADD CONSTRAINT billing_events_revenue_stream_corrected_chk
  CHECK (revenue_stream_corrected IS NULL OR revenue_stream_corrected IN
    ('plan','merchant_cleaning','ai_credits','ad_management'));

ALTER TABLE public.billing_events
  DROP CONSTRAINT IF EXISTS billing_events_correction_confidence_chk;
ALTER TABLE public.billing_events
  ADD CONSTRAINT billing_events_correction_confidence_chk
  CHECK (correction_confidence IS NULL OR correction_confidence IN
    ('certain','probable','inferred'));

COMMENT ON COLUMN public.billing_events.revenue_stream_corrected IS
  'Reversible reclassification applied 2026-07-31. revenue_stream is left untouched as the original backfill label. Reports should read coalesce(revenue_stream_corrected, revenue_stream). Undo with UPDATE ... SET revenue_stream_corrected = NULL (optionally filtered by correction_basis).';
COMMENT ON COLUMN public.billing_events.correction_basis IS
  'Rule that produced revenue_stream_corrected: pi_booking_match, pi_tip_match, pre_saas_cutoff, payer_email_is_customer, payer_email_is_org_owner, unresolved_heuristic, inherited_from_parent_charge.';
COMMENT ON COLUMN public.billing_events.correction_confidence IS
  'certain = verifiable (booking/tip payment-intent match, or dated before the first platform account existed on 2025-12-18). probable = payer email resolves to a known cleaning customer or org owner. inferred = no signal; amount shape only. Never total inferred rows into a headline figure without saying so.';

-- Append-only trigger allows classification columns to be maintained.
CREATE INDEX IF NOT EXISTS billing_events_stream_corrected_idx
  ON public.billing_events (revenue_stream_corrected, correction_confidence);

CREATE OR REPLACE VIEW public.billing_revenue_by_confidence
WITH (security_invoker = true) AS
SELECT
  date_trunc('month', occurred_at)::date AS month,
  coalesce(revenue_stream_corrected, revenue_stream) AS stream,
  coalesce(correction_confidence, 'certain')        AS confidence,
  event_type,
  count(*)                                          AS events,
  sum(amount_cents) FILTER (WHERE counts_as_cash)   AS cash_cents
FROM public.billing_events
GROUP BY 1,2,3,4;

COMMENT ON VIEW public.billing_revenue_by_confidence IS
  'Revenue always broken out by stream AND confidence tier. Any single-figure report must use certain+probable only and state the inferred remainder separately as unclassified. Do not SUM across confidence tiers into one headline number.';

GRANT SELECT ON public.billing_revenue_by_confidence TO service_role;
