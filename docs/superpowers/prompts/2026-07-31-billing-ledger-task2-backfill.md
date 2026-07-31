# Lovable prompt — Task 2: Stripe backfill into the ledger

**Plan:** `docs/superpowers/plans/2026-07-30-owned-revenue-ledger.md`
**Task 1 status:** deployed and verified — both FKs read `ON DELETE SET NULL`,
`is_platform_admin()` was the branch taken, append-only bites under `service_role`, and
`billing_monthly_cents` returns 9700 for monthly / annual÷12 / quarterly÷3 / 50%-discount.
**Written against the deployed schema** (`20260731132628…sql`), not against the plan.

---

## Three things the deployed schema forces, which the plan did not spell out

**1. The backfill can INSERT into `billing_events` but can NEVER UPDATE it.**
`billing_events_append_only()` exempts only `postgres` and `supabase_admin`. Edge
functions run as `service_role`, which is **not** exempt — deliberately. So
`ON CONFLICT … DO UPDATE` on that table raises `42501` at runtime. It must be
`ON CONFLICT … DO NOTHING`, every time.

**2. `billing_subscription_periods` has no such trigger**, so `DO UPDATE` is fine there
— and needed, since a period's `effective_to` gets closed when the next one opens.

**3. The conflict targets are already unique constraints**, so upserts need no extra
index: `billing_events (stripe_object_id, event_type)` and
`billing_subscription_periods (stripe_subscription_id, effective_from)`.

---

## The prompt

````
Please create and DEPLOY a new edge function `billing-backfill` on the main project
(slwfkaqczvwvvvavkgpr).

CONTEXT: Task 1 created public.billing_events, public.billing_subscription_periods
and public.billing_backfill_jobs, all live and verified. This job replays Stripe
history into them. It reads Stripe and writes those three tables; it must not
touch anything else.

=============================================================================
HARD CONSTRAINTS — please read these before writing any code
=============================================================================

1. billing_events is APPEND-ONLY and service_role is NOT exempt from the trigger.
   Use `ON CONFLICT (stripe_object_id, event_type) DO NOTHING`.
   NEVER `DO UPDATE` on that table — it raises 42501 at runtime, not at deploy.

2. billing_subscription_periods has no such trigger. Use
   `ON CONFLICT (stripe_subscription_id, effective_from) DO UPDATE` there.

3. Use a Stripe RESTRICTED key with READ-ONLY scopes, from a new secret
   STRIPE_BACKFILL_READ_KEY. Do not use STRIPE_SECRET_KEY. This job will be run
   repeatedly and reads only.

4. PLATFORM Stripe only. Do not touch any org's Connect account, and do not import
   anything from create-stripe-invoice, send-invoice or process-deposit — those are
   orgs charging their own customers and would inflate our revenue by their entire
   transaction volume.

5. Money is integer cents from Stripe, stored as-is. Never divide, never round,
   never use a float.

=============================================================================
SHAPE — resumable, not one long run
=============================================================================

A single invocation must not try to page the whole account. Accept a body of
{ resource, mode, maxPages } and process at most maxPages (default 5) per call:

  resource: 'subscriptions' | 'invoices' | 'charges' | 'refunds' | 'disputes'
          | 'checkout_sessions'
  mode:     'count' | 'run'   (default 'run')

Per invocation:
  - upsert the billing_backfill_jobs row for that resource (UNIQUE on resource),
    set status='running' and started_at if not already set
  - resume from its cursor_after using Stripe's starting_after
  - after each page: update cursor_after, pages_done, objects_seen, rows_written
  - when Stripe reports has_more = false: status='complete', finished_at=now()
  - on any error: status='failed', last_error=<message>, and return 200 with the
    error in the body so the caller can see it without a retry storm
  - return { resource, status, pages_done, objects_seen, rows_written, has_more }

mode='count' walks the pages and returns counts WITHOUT writing any rows. That is
the dry run — I want those numbers as a completeness baseline before anything is
inserted.

=============================================================================
ORDER — run these in sequence, not in parallel
=============================================================================

  1. subscriptions      (the spine — establishes periods)
  2. invoices           (cash, and the price history that reveals plan changes)
  3. charges
  4. refunds
  5. disputes
  6. checkout_sessions  (gives AI credits and lifetime their dollar amounts)

=============================================================================
MAPPING — what each Stripe object becomes
=============================================================================

revenue_stream is derived from the Stripe price id, using the SAME env vars
_shared/plan-tier.ts already uses:

  STRIPE_BASIC_MONTHLY_PRICE_ID / STRIPE_BASIC_YEARLY_PRICE_ID  -> 'plan'
  STRIPE_PRO_MONTHLY_PRICE_ID   / STRIPE_PRO_YEARLY_PRICE_ID    -> 'plan'
  STRIPE_CUSTOM_MONTHLY_PRICE_ID/ STRIPE_CUSTOM_YEARLY_PRICE_ID -> 'plan'
  STRIPE_LIFETIME_PRICE_ID                                      -> 'lifetime'

Ad-management prices are not in env. Identify those subscriptions by matching
stripe_subscription_id against public.ad_management_subscriptions and set
revenue_stream='ad_management'. If a price matches nothing at all, still write the
row with revenue_stream='plan' and put the unmatched price id in `description` —
do NOT skip it. A silently dropped row is worse than a mislabelled one, and I can
correct a label later.

subscriptions -> billing_subscription_periods, one row per price-state:
  stripe_subscription_id, stripe_customer_id, stripe_price_id, revenue_stream,
  plan_label (the price nickname or product name),
  unit_amount_cents = item.price.unit_amount, quantity = item.quantity,
  currency, billing_interval = item.price.recurring.interval,
  interval_count = item.price.recurring.interval_count,
  discount_percent / discount_amount_cents from subscription.discount.coupon,
  status = subscription.status,
  effective_from = subscription.start_date (or current_period_start),
  effective_to = subscription.ended_at (NULL if still running),
  cancellation_reason: map subscription.cancellation_details.reason —
    'cancellation_requested' -> 'voluntary'
    'payment_failed'         -> 'involuntary'
    anything else / absent   -> NULL
  cancellation_detail = the raw reason/feedback/comment,
  raw = the whole subscription object.

  Use subscriptions.list({ status: 'all' }) so CANCELLED subscriptions are
  included — they carry the churn data and are the whole point.

invoices -> billing_events, event_type='invoice.paid', ONLY where
  invoice.status='paid':
  occurred_at = status_transitions.paid_at (fall back to created),
  amount_cents = amount_paid, currency, counts_as_cash = TRUE,
  is_proration = true if ANY line item has proration=true,
  stripe_invoice_id, stripe_subscription_id, stripe_customer_id,
  raw = the invoice.

  Unpaid/void/draft invoices: write event_type='invoice.payment_failed' with
  counts_as_cash = FALSE for status='uncollectible' or a failed payment attempt;
  skip drafts entirely.

charges -> billing_events, event_type='charge.succeeded' or 'charge.failed':
  counts_as_cash = FALSE when the charge has an invoice (the invoice row above
  already counted that money — this is the SAME money and would double-count),
  counts_as_cash = TRUE only for charges with NO invoice, which is how one-off
  AI-credit and lifetime purchases arrive.
  fee_cents / net_cents from balance_transaction where expandable.

refunds -> billing_events, event_type='charge.refunded',
  amount_cents = NEGATIVE refund.amount, counts_as_cash = TRUE.

disputes -> billing_events, event_type='charge.dispute',
  amount_cents = NEGATIVE dispute.amount, counts_as_cash = TRUE.

checkout_sessions -> for sessions with payment_status='paid':
  metadata.purpose='ai_credits_topup' -> event_type='credits.purchased',
    revenue_stream='ai_credits', amount_cents = amount_total, counts_as_cash=TRUE
  lifetime sessions -> event_type='lifetime.purchased',
    revenue_stream='lifetime', counts_as_cash=TRUE
  Everything else: skip.

organization_id / organization_name / customer_email on every row: resolve the
Stripe customer's email, look it up in public.profiles, then org_memberships to
find the organisation. If it cannot be resolved, STILL WRITE THE ROW with
organization_id NULL and customer_email set. Never drop a row for want of an org —
the identity columns are denormalised precisely so a row survives without one.

=============================================================================
AFTERWARDS
=============================================================================

Run mode='count' for all six resources FIRST and paste those numbers. Do not
write any rows until I have seen them.

Then, once I say go and the run completes, paste:

  select resource, status, pages_done, objects_seen, rows_written, last_error
  from public.billing_backfill_jobs order by resource;

  select revenue_stream, event_type, count(*),
         min(occurred_at) as first, max(occurred_at) as last,
         sum(amount_cents) filter (where counts_as_cash) as cash_cents
  from public.billing_events group by 1,2 order by 1,2;

  -- lifetime is the one stream with local ground truth, so it is the check
  -- that can actually fail
  select (select sum(amount_cents) from public.lifetime_access_purchases) as local_cents,
         (select sum(amount_cents) from public.billing_events
           where revenue_stream='lifetime' and counts_as_cash)            as ledger_cents;

Confirm the function is DEPLOYED, not just committed.
````

---

## After the run — the check that matters

Re-run the whole backfill and confirm `select count(*) from billing_events` is
**identical**. If it grows, the conflict target is wrong and every future run will
double-count. That is cheaper to find now than after the readers switch over.

The lifetime reconciliation is the other one worth doing carefully: it is the only
stream where a local table already holds the money in cents, so a mismatch there means
the mapping is wrong somewhere it can be seen — as opposed to the plan/ad-management
streams, where the ledger would be the first and only record.
