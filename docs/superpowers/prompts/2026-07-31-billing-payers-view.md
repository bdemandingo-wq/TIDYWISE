# Lovable prompt — payer-grain view for "Businesses paying for TidyWise"

**Status:** ready to paste.
**Superseded in part:** the `GRANT SELECT ON billing_backfill_jobs TO authenticated`
this prompt originally carried landed separately in
`20260731152612_212b467e…sql`, so it has been removed from the paste block. That
migration also set `security_invoker = true` on `billing_monthly_summary` — unrelated
to this work, and not a view the revenue page reads.
**Why:** `billing_revenue_by_confidence` is grouped by `(month, stream, confidence)` and
carries no payer column. The revenue page's payer panel is a placeholder until this exists.
**Scope decided:** SaaS `plan` only. `merchant_cleaning` payers are the businesses' own
cleaning customers — a different population that already lives elsewhere in the app, and
putting both in one list would blur exactly what the two-panel layout keeps apart.

---

## Two things to get right, both of which would fail quietly

**1. Use `COALESCE(revenue_stream_corrected, revenue_stream)`, not `revenue_stream_corrected = 'plan'`.**

The column's own comment says: *"revenue_stream is left untouched as the original backfill
label. Reports should read coalesce(revenue_stream_corrected, revenue_stream)."* Rows that
were never reclassified have `revenue_stream_corrected IS NULL`, so a strict equality would
silently drop them — probably most of the population — and the payer list would under-report
against the headline while looking perfectly plausible.

**2. Reversals that resolve to no organisation must be kept, as their own row.**

Two chargebacks are fraudulent and have no payer. If they are filtered out, the payer list
stops summing to the figure above it. **A payer list that does not reconcile to its own
headline is a bug**, so they get grouped under a NULL organisation and rendered as a
separate line rather than dropped.

---

## The prompt

````
Please run a migration on the main project (slwfkaqczvwvvvavkgpr).

CONTEXT: public.billing_revenue_by_confidence is grouped by (month, stream,
confidence) and has no payer column, so the revenue page cannot show which
businesses have paid. This adds a second view at payer grain, scoped to SaaS plan
revenue only.

Do NOT change billing_revenue_by_confidence, and do NOT change billing_events.
This is additive.

CREATE THE VIEW

create or replace view public.billing_plan_payers
with (security_invoker = true) as
select
    be.organization_id,
    -- Denormalised on purpose: an org can be deleted (organization_id is
    -- ON DELETE SET NULL) and the revenue history must still read standalone.
    max(be.organization_name)                                   as organization_name,
    max(be.customer_email)                                      as customer_email,
    min(be.occurred_at)                                         as first_payment_at,
    max(be.occurred_at)                                         as last_payment_at,
    count(*) filter (where be.amount_cents >= 0)                as payment_events,
    count(*) filter (where be.amount_cents <  0)                as reversal_events,
    coalesce(sum(be.amount_cents) filter (where be.amount_cents >= 0), 0) as gross_cents,
    coalesce(sum(be.amount_cents) filter (where be.amount_cents <  0), 0) as reversal_cents,
    coalesce(sum(be.amount_cents), 0)                           as net_cash_cents,
    -- The weakest tier contributing to this payer's total. Without it a payer
    -- whose figure is entirely inferred would look identical to one that is
    -- certain, which reintroduces exactly the folding the confidence tiers exist
    -- to prevent.
    case
      when bool_or(coalesce(be.correction_confidence,'certain') = 'inferred') then 'inferred'
      when bool_or(coalesce(be.correction_confidence,'certain') = 'probable') then 'probable'
      else 'certain'
    end                                                         as confidence_worst
from public.billing_events be
where be.counts_as_cash
  and coalesce(be.revenue_stream_corrected, be.revenue_stream) = 'plan'
group by be.organization_id;

IMPORTANT — the two details that make this reconcile:

  a) The stream test is coalesce(revenue_stream_corrected, revenue_stream), NOT
     revenue_stream_corrected = 'plan'. revenue_stream_corrected is NULL on every
     row that was never reclassified, and the column comment says reports must
     read the coalesce. Strict equality would drop most of the population and the
     list would silently under-report.

  b) There is NO filter on organization_id. Two reversals are fraudulent
     chargebacks that resolve to no organisation; they group under a NULL
     organization_id and the page renders them as their own line. Filtering them
     out would make the payer list stop summing to the headline figure above it.

  c) The population is pinned the same way as billing_revenue_by_confidence:
     WHERE counts_as_cash, netting structural (reversals are negative rows in the
     same population), counts and amounts from the same rows. Do not add an
     event_type filter — that is what previously reported one tier gross of a $49
     dispute while the others were net.

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

AFTERWARDS please paste:

  -- 1. The payer list itself
  select organization_id, organization_name, customer_email,
         payment_events, reversal_events,
         gross_cents/100.0  as gross_usd,
         reversal_cents/100.0 as reversal_usd,
         net_cash_cents/100.0 as net_usd,
         confidence_worst, first_payment_at, last_payment_at
  from public.billing_plan_payers
  order by net_cash_cents desc;

  -- 2. THE RECONCILIATION. These two must be equal. If they are not, the view
  --    is dropping rows and must not be used.
  select
    (select coalesce(sum(net_cash_cents),0) from public.billing_plan_payers) as payers_total_cents,
    (select coalesce(sum(net_cash_cents),0) from public.billing_revenue_by_confidence
      where stream = 'plan')                                                 as view_plan_total_cents;

  -- 3. Do the other two SaaS streams carry any cash? The revenue page's SaaS
  --    panel sums plan + ai_credits + ad_management, so if either of these is
  --    non-zero the payer list covers only part of that panel and the page must
  --    say so rather than implying it reconciles.
  select stream,
         sum(net_cash_cents)/100.0 as net_usd,
         sum(events)               as events
  from public.billing_revenue_by_confidence
  where stream in ('ai_credits','ad_management')
  group by stream;

Confirm the migration RAN, not just that a file was created.
````

---

## What the results decide

**Query 2 is the gate.** If `payers_total_cents` and `view_plan_total_cents` differ, the
view is dropping rows — most likely the NULL-organisation reversals or the coalesce — and
the panel should not ship until they match.

**Query 3 decides the panel's label and subtitle.** If `ai_credits` and `ad_management` both
return zero, then plan *is* the whole SaaS figure and the payer panel reconciles to the SaaS
headline directly. If either is non-zero, the panel must state that it covers plan revenue
only, or it will appear not to add up against the panel above it.

## Panel naming, already applied

The placeholder is titled **"Businesses paying for TidyWise"** rather than "Payers" or
"Customers". Deliberate: a generic name is an invitation for someone later to widen it to
include cleaning customers, which is the exact blur the two-panel layout exists to prevent.
The view's own `COMMENT` says the same thing, so the constraint survives in the database
even if the page is rewritten.
