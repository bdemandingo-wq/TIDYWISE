create or replace view public.billing_plan_payers
with (security_invoker = true) as
select
    be.organization_id,
    max(be.organization_name)                                   as organization_name,
    max(be.customer_email)                                      as customer_email,
    min(be.occurred_at)                                         as first_payment_at,
    max(be.occurred_at)                                         as last_payment_at,
    count(*) filter (where be.amount_cents >= 0)                as payment_events,
    count(*) filter (where be.amount_cents <  0)                as reversal_events,
    coalesce(sum(be.amount_cents) filter (where be.amount_cents >= 0), 0) as gross_cents,
    coalesce(sum(be.amount_cents) filter (where be.amount_cents <  0), 0) as reversal_cents,
    coalesce(sum(be.amount_cents), 0)                           as net_cash_cents,
    case
      when bool_or(coalesce(be.correction_confidence,'certain') = 'inferred') then 'inferred'
      when bool_or(coalesce(be.correction_confidence,'certain') = 'probable') then 'probable'
      else 'certain'
    end                                                         as confidence_worst
from public.billing_events be
where be.counts_as_cash
  and coalesce(be.revenue_stream_corrected, be.revenue_stream) = 'plan'
group by be.organization_id;

grant select on public.billing_plan_payers to authenticated;
grant select on public.billing_plan_payers to service_role;

comment on view public.billing_plan_payers is
'Payer-grain companion to billing_revenue_by_confidence, scoped to SaaS plan
revenue only (coalesce(revenue_stream_corrected, revenue_stream) = ''plan'').
Population pinned identically: WHERE counts_as_cash, structural netting, counts
and amounts from the same rows. Rows with a NULL organization_id are real and
must NOT be filtered out — they are reversals that resolve to no payer, and
excluding them stops this view summing to the plan total in
billing_revenue_by_confidence. Deliberately EXCLUDES merchant_cleaning: those
payers are the businesses own cleaning customers, a different population that
belongs elsewhere. Do not widen this view to include them.';