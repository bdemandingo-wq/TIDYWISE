DROP VIEW IF EXISTS public.billing_revenue_by_confidence;

CREATE VIEW public.billing_revenue_by_confidence
WITH (security_invoker = true) AS
SELECT
    date_trunc('month', occurred_at)::date                       AS month,
    COALESCE(revenue_stream_corrected, revenue_stream)           AS stream,
    COALESCE(correction_confidence, 'certain')                   AS confidence,
    count(*)                                                     AS events,
    count(*) FILTER (WHERE amount_cents >= 0)                    AS payment_events,
    count(*) FILTER (WHERE amount_cents <  0)                    AS reversal_events,
    COALESCE(sum(amount_cents) FILTER (WHERE amount_cents >= 0), 0) AS gross_cents,
    COALESCE(sum(amount_cents) FILTER (WHERE amount_cents <  0), 0) AS reversal_cents,
    COALESCE(sum(amount_cents), 0)                               AS net_cash_cents
FROM public.billing_events
WHERE counts_as_cash
GROUP BY 1, 2, 3;

GRANT SELECT ON public.billing_revenue_by_confidence TO authenticated;
GRANT SELECT ON public.billing_revenue_by_confidence TO service_role;

COMMENT ON VIEW public.billing_revenue_by_confidence IS
'THE reporting surface for platform revenue. Do not report off billing_events directly.
Population is pinned: WHERE counts_as_cash — failed charges and failed invoices are excluded,
successful charges, paid invoices, refunds and disputes are included. Counts and amounts are
drawn from the same rows, so events and net_cash_cents can never describe different populations
(this is what produced the 94-rows/$2,179 mismatch on 2026-07-31).
Netting is structural, not optional: reversals are negative amount_cents rows inside the same
population, so net_cash_cents is net for every confidence tier or none. event_type is
deliberately NOT in the grain — filtering to charge.succeeded was how one tier was reported
gross of a $49 dispute while the others were net. Use gross_cents / reversal_cents when a
gross figure is wanted; do not reconstruct one with a WHERE clause.
Reconciled 2026-07-31: SaaS plan revenue = $2,179.00 across 50 cash-bearing rows.';

COMMENT ON TABLE public.billing_events IS
'Append-only raw Stripe ledger. NOT A REPORTING SURFACE — do not aggregate this table directly.
It contains non-cash rows (charge.failed, invoice.payment_failed) alongside cash rows, and
mixing them, or counting rows on a different filter than the one used to sum amounts, will
produce a figure that disagrees with every other figure. Two reports of the same classification
disagreed on 2026-07-31 for exactly this reason.
Report from public.billing_revenue_by_confidence instead. Use counts_as_cash to identify
cash-bearing rows and revenue_stream_corrected / correction_confidence (not revenue_stream)
for stream classification.';

COMMENT ON COLUMN public.billing_events.counts_as_cash IS
'True for rows that moved money: charge.succeeded, invoice.paid, charge.refunded (negative),
charge.dispute (negative), adjustments, credit purchases. False for charge.failed and
invoice.payment_failed. Any report that counts rows must apply this filter to the count as
well as to the sum, or the two will describe different populations.';

COMMENT ON COLUMN public.billing_events.revenue_stream_corrected IS
'Authoritative stream classification, applied 2026-07-31. Prefer this over revenue_stream,
which holds the pre-correction backfill value. Read alongside correction_confidence
(certain / probable / inferred) and correction_basis.';