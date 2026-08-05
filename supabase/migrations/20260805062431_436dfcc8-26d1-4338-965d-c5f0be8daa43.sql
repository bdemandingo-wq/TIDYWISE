-- 1. Attribute reversals (refunds/disputes) to the org of the charge they reverse.
--    Without this they group into an "unattributed" bucket and never net against
--    the payer that actually received the money back.
UPDATE public.billing_events r
SET organization_id   = p.organization_id,
    organization_name = p.organization_name,
    customer_email    = p.customer_email
FROM public.billing_events p
WHERE r.amount_cents < 0
  AND r.organization_id IS NULL
  AND p.stripe_charge_id = r.stripe_charge_id
  AND p.event_type = 'charge.succeeded'
  AND p.organization_id IS NOT NULL;

-- 2. Three charges synced after the 2026-07-31 relabel never ran through it.
--    They are cleaning customers paying a business, not businesses paying TidyWise.
UPDATE public.billing_events
SET revenue_stream_corrected = 'merchant_cleaning',
    correction_confidence    = 'probable',
    correction_basis         = 'payer_is_cleaning_customer | corrected 2026-08-05: synced after the 2026-07-31 relabel pass, so it kept the default plan stream. Amount shape and payer are a cleaning job, not a TidyWise subscription.',
    corrected_at             = now()
WHERE counts_as_cash
  AND COALESCE(revenue_stream_corrected, revenue_stream) = 'plan'
  AND organization_id IS NULL
  AND amount_cents > 0
  AND customer_email IN ('dave@davemillercpa.com','noemail0993@gmail.com','niaz.131131@gmail.com');

-- 3. Real cash, but not TidyWise subscription revenue. counts_as_cash=false keeps
--    the row (append-only ledger) while removing it from every revenue view.
--    Reversals of these charges are excluded too, or netting breaks.
UPDATE public.billing_events
SET counts_as_cash   = false,
    correction_basis = COALESCE(correction_basis || ' | ', '')
      || 'counts_as_cash=false 2026-08-05: not TidyWise subscription revenue. '
      || CASE
           WHEN organization_id = '6fd529f0-ad9d-425b-a236-f717eae8f3e1'
             THEN 'Clean Castillo - personal, paid by a friend of the founder.'
           ELSE 'Pointpolishcleaners / Lumi Elevated - payment for website build work, not a plan.'
         END,
    corrected_at     = now()
WHERE counts_as_cash
  AND organization_id IN (
    '6fd529f0-ad9d-425b-a236-f717eae8f3e1',  -- Clean Castillo
    '3b3d86f6-9e9f-42ac-ab41-5010f3350664',  -- Pointpolishcleaners
    'a7322002-ae47-43fc-b206-fae5dcdf5150'   -- Lumi Elevated Cleaning
  );

-- 4. A $0 invoice (trial or fully-discounted) is not a payment. Counting it as one
--    is what made PrimeWorks read as "4 payments" for $100.
CREATE OR REPLACE VIEW public.billing_plan_payers WITH (security_invoker = true) AS
SELECT organization_id,
       max(organization_name) AS organization_name,
       max(customer_email)    AS customer_email,
       min(occurred_at)       AS first_payment_at,
       max(occurred_at)       AS last_payment_at,
       count(*) FILTER (WHERE amount_cents > 0) AS payment_events,
       count(*) FILTER (WHERE amount_cents < 0) AS reversal_events,
       COALESCE(sum(amount_cents) FILTER (WHERE amount_cents > 0), 0) AS gross_cents,
       COALESCE(sum(amount_cents) FILTER (WHERE amount_cents < 0), 0) AS reversal_cents,
       COALESCE(sum(amount_cents), 0) AS net_cash_cents,
       CASE
         WHEN bool_or(COALESCE(correction_confidence, 'certain') = 'inferred') THEN 'inferred'
         WHEN bool_or(COALESCE(correction_confidence, 'certain') = 'probable') THEN 'probable'
         ELSE 'certain'
       END AS confidence_worst
FROM public.billing_events be
WHERE counts_as_cash
  AND COALESCE(revenue_stream_corrected, revenue_stream) = 'plan'
GROUP BY organization_id;

GRANT SELECT ON public.billing_plan_payers TO authenticated;