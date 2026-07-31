-- Suppress the invoice side of 12 charge/invoice pairs that represent the same
-- payment. Pairing rule: identical stripe_customer_id + identical amount within
-- a 60-second window (observed max gap: 9s). Org+day pairing was rejected as a
-- rule because PrimeWorks Cleaning has two genuinely distinct $50 payments on
-- 2026-03-24 under two different Stripe customers.
WITH dupes AS (
  SELECT i.id
  FROM public.billing_events i
  JOIN public.billing_events c
    ON c.event_type = 'charge.succeeded'
   AND c.counts_as_cash
   AND c.stripe_customer_id = i.stripe_customer_id
   AND c.amount_cents = i.amount_cents
   AND abs(extract(epoch FROM (i.occurred_at - c.occurred_at))) <= 60
  WHERE i.event_type = 'invoice.paid'
    AND i.counts_as_cash
    AND i.amount_cents > 0
    AND i.revenue_stream_corrected = 'plan'
)
UPDATE public.billing_events be
SET counts_as_cash = false,
    correction_basis = coalesce(be.correction_basis || ' | ', '')
      || 'counts_as_cash=false 2026-07-31: duplicate of a charge.succeeded row for the same Stripe customer, same amount, within 60s. Invoice side suppressed so the payment is counted once (charge side is authoritative).',
    corrected_at = now()
FROM dupes d
WHERE be.id = d.id;

COMMENT ON VIEW public.billing_revenue_by_confidence IS
  'Only reporting surface for owned SaaS revenue. Population is fixed: counts_as_cash rows only, netted structurally (net_cash_cents = gross_cents - reversal_cents); counts and amounts come from the same population. Do not aggregate public.billing_events directly. Confirmed SaaS plan revenue: $1,290.00 across 38 cash-bearing rows. The earlier $2,179.00 / 50-row figure was wrong: 12 invoice.paid rows duplicated a charge.succeeded row for the same payment ($889 double-counted) and were flipped to counts_as_cash=false on 2026-07-31. The 21 zero-dollar invoice.paid rows remain counted - a $0 trial cycle is a real cash event of zero and preserves trial volume.';