# Lovable prompt — Task 1: billing ledger schema

**Plan:** `docs/superpowers/plans/2026-07-30-owned-revenue-ledger.md`
**Status:** ready to paste. Creates structure only — moves no data, touches no existing table.

---

## The prompt

````
Please run a migration on the main project (slwfkaqczvwvvvavkgpr).

CONTEXT: we are building an owned, exportable copy of all TidyWise platform
revenue (the subscriptions and one-off purchases our customers pay US — not the
Stripe Connect payments our customers collect from their own clients). This
migration creates the schema only. No data is moved and no existing table is
touched. Later tasks backfill from Stripe and add live webhook capture.

Four revenue streams must all be first-class from the start:
  plan          - Basic/Pro/Custom subscriptions
  ad_management - $400/mo per platform, up to 3 per org
  lifetime      - one-off lifetime access
  ai_credits    - one-off AI credit top-ups

Two numbers must stay SEPARATE and must never be reconciled into one:
  MRR  - normalised recurring revenue, from subscription price state
  cash - money actually collected, from invoices/charges
Stripe prorates, so these legitimately differ. The gap must be visible, not
hidden.

=============================================================================
1. HELPER FUNCTION — monthly normalisation
=============================================================================

CREATE OR REPLACE FUNCTION public.billing_monthly_cents(
  p_unit_amount_cents     bigint,
  p_quantity              integer,
  p_billing_interval      text,
  p_interval_count        integer,
  p_discount_percent      numeric,
  p_discount_amount_cents bigint
) RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT GREATEST(0, ROUND(
    (
      (p_unit_amount_cents::numeric * COALESCE(p_quantity, 1))
      / (
          GREATEST(COALESCE(p_interval_count, 1), 1)::numeric
          * CASE p_billing_interval
              WHEN 'month' THEN 1.0
              WHEN 'year'  THEN 12.0
              WHEN 'week'  THEN 12.0 / 52.0
              WHEN 'day'   THEN 12.0 / 365.0
              ELSE 1.0
            END
        )
    )
    * (1 - COALESCE(p_discount_percent, 0) / 100.0)
    - COALESCE(p_discount_amount_cents, 0)
  ))::bigint
$fn$;

COMMENT ON FUNCTION public.billing_monthly_cents IS
  'Normalises any Stripe recurring price to monthly cents, net of discount. '
  'Deliberately a function rather than a generated column: Postgres generated '
  'columns cannot reference other generated columns, and the MRR rule should be '
  'changeable without rewriting stored rows.';

=============================================================================
2. TABLE — billing_events (append-only cash ledger)
=============================================================================

CREATE TABLE public.billing_events (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stripe's timestamp, not ours. synced_at is ours. Both matter.
  occurred_at               timestamptz NOT NULL,
  synced_at                 timestamptz NOT NULL DEFAULT now(),

  event_type                text NOT NULL,
  revenue_stream            text NOT NULL,

  -- Stripe identity
  stripe_object_id          text NOT NULL,
  stripe_customer_id        text,
  stripe_subscription_id    text,
  stripe_invoice_id         text,
  stripe_payment_intent_id  text,
  stripe_charge_id          text,

  -- Identity denormalised as TEXT on purpose: an exported CSV must read
  -- standalone. A row saying organization_id 7f3a... is useless to an
  -- accountant, a buyer, or to us in three years.
  organization_id           uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  organization_name         text,
  customer_email            text,

  -- Money. Signed: refunds and disputes are negative. Integer cents, never float.
  amount_cents              bigint NOT NULL,
  currency                  text NOT NULL DEFAULT 'usd',
  fee_cents                 bigint,
  net_cents                 bigint,

  -- An invoice and its charge are the SAME money. Both are stored for fidelity,
  -- but exactly one is flagged, so SUM(amount_cents) WHERE counts_as_cash is
  -- unambiguous and auditable.
  counts_as_cash            boolean NOT NULL DEFAULT false,

  -- Captured at ingest because it cannot be recovered afterwards. This is what
  -- makes the MRR-vs-cash gap explainable.
  is_proration              boolean NOT NULL DEFAULT false,

  description               text,
  raw                       jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT billing_events_stream_chk CHECK (
    revenue_stream IN ('plan','ad_management','lifetime','ai_credits')
  ),
  CONSTRAINT billing_events_type_chk CHECK (
    event_type IN (
      'invoice.paid','invoice.payment_failed',
      'charge.succeeded','charge.failed','charge.refunded','charge.dispute',
      'subscription.started','subscription.changed','subscription.cancelled',
      'credits.purchased','lifetime.purchased','adjustment'
    )
  ),
  CONSTRAINT billing_events_currency_chk CHECK (currency = lower(currency)),

  -- Makes backfill and live webhooks CONVERGE instead of duplicating.
  CONSTRAINT billing_events_object_uniq UNIQUE (stripe_object_id, event_type)
);

COMMENT ON TABLE public.billing_events IS
  'Append-only ledger of every platform money movement. Never UPDATE or DELETE — '
  'corrections are new rows with event_type = adjustment. Survives organization '
  'deletion by design (organization_id is ON DELETE SET NULL and identity is '
  'denormalised).';

=============================================================================
3. TABLE — billing_subscription_periods (MRR spine)
=============================================================================

One row per subscription per price-state. A price change closes the current row
(sets effective_to) and opens a new one. MRR at any date is then a range query,
with no recomputation from events and no Stripe API call.

CREATE TABLE public.billing_subscription_periods (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  stripe_subscription_id  text NOT NULL,
  stripe_customer_id      text,
  stripe_price_id         text,
  revenue_stream          text NOT NULL,

  organization_id         uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  organization_name       text,
  customer_email          text,

  plan_label              text,
  unit_amount_cents       bigint NOT NULL,
  quantity                integer NOT NULL DEFAULT 1,
  currency                text NOT NULL DEFAULT 'usd',
  billing_interval        text NOT NULL,
  interval_count          integer NOT NULL DEFAULT 1,

  discount_percent        numeric(5,2),
  discount_amount_cents   bigint,

  status                  text NOT NULL,

  effective_from          timestamptz NOT NULL,
  effective_to            timestamptz,          -- NULL = still current

  -- The distinction that matters: one is a product problem, one is a card problem.
  cancellation_reason     text,
  cancellation_detail     text,                 -- raw Stripe reason/feedback/comment

  synced_at               timestamptz NOT NULL DEFAULT now(),
  raw                     jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT bsp_stream_chk   CHECK (revenue_stream IN ('plan','ad_management')),
  CONSTRAINT bsp_interval_chk CHECK (billing_interval IN ('day','week','month','year')),
  CONSTRAINT bsp_status_chk   CHECK (status IN (
    'trialing','active','past_due','unpaid','canceled','incomplete',
    'incomplete_expired','paused'
  )),
  CONSTRAINT bsp_cancel_chk   CHECK (
    cancellation_reason IS NULL OR cancellation_reason IN ('voluntary','involuntary')
  ),
  CONSTRAINT bsp_range_chk    CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT bsp_period_uniq  UNIQUE (stripe_subscription_id, effective_from)
);

COMMENT ON COLUMN public.billing_subscription_periods.cancellation_reason IS
  'voluntary   = Stripe cancellation_details.reason cancellation_requested. '
  'involuntary = payment_failed, i.e. dunning exhausted. Derived at ingest.';

=============================================================================
4. TABLE — billing_backfill_jobs (resumable cursor)
=============================================================================

A single edge invocation cannot page a whole Stripe account. The cursor lives
here so Task 2 can be re-invoked until complete, and re-run safely afterwards.

CREATE TABLE public.billing_backfill_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource        text NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  cursor_after    text,
  pages_done      integer NOT NULL DEFAULT 0,
  objects_seen    integer NOT NULL DEFAULT 0,
  rows_written    integer NOT NULL DEFAULT 0,
  last_error      text,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bbj_resource_chk CHECK (resource IN (
    'subscriptions','invoices','charges','refunds','disputes','checkout_sessions'
  )),
  CONSTRAINT bbj_status_chk CHECK (status IN ('pending','running','complete','failed')),
  CONSTRAINT bbj_resource_uniq UNIQUE (resource)
);

=============================================================================
5. APPEND-ONLY ENFORCEMENT
=============================================================================

Enforced by the database, not by convention. History that can be rewritten is
not a record.

CREATE OR REPLACE FUNCTION public.billing_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $t$
BEGIN
  -- Migration-level roles may still repair a bad backfill. service_role is
  -- deliberately NOT exempt: the edge functions must only ever append.
  IF current_user IN ('postgres','supabase_admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION
    'billing_events is append-only (attempted %). Record a correction as a new row with event_type = adjustment.',
    TG_OP
    USING ERRCODE = '42501';
END;
$t$;

CREATE TRIGGER billing_events_no_update
  BEFORE UPDATE ON public.billing_events
  FOR EACH ROW EXECUTE FUNCTION public.billing_events_append_only();

CREATE TRIGGER billing_events_no_delete
  BEFORE DELETE ON public.billing_events
  FOR EACH ROW EXECUTE FUNCTION public.billing_events_append_only();

=============================================================================
6. INDEXES
=============================================================================

CREATE INDEX idx_billing_events_occurred     ON public.billing_events (occurred_at DESC);
CREATE INDEX idx_billing_events_stream_time  ON public.billing_events (revenue_stream, occurred_at DESC);
CREATE INDEX idx_billing_events_cash         ON public.billing_events (occurred_at) WHERE counts_as_cash;
CREATE INDEX idx_billing_events_customer     ON public.billing_events (stripe_customer_id);
CREATE INDEX idx_billing_events_org          ON public.billing_events (organization_id);
CREATE INDEX idx_billing_events_sub          ON public.billing_events (stripe_subscription_id);

CREATE INDEX idx_bsp_sub        ON public.billing_subscription_periods (stripe_subscription_id);
CREATE INDEX idx_bsp_effective  ON public.billing_subscription_periods (effective_from, effective_to);
CREATE INDEX idx_bsp_current    ON public.billing_subscription_periods (status) WHERE effective_to IS NULL;
CREATE INDEX idx_bsp_org        ON public.billing_subscription_periods (organization_id);

=============================================================================
7. VIEW — billing_monthly_summary
=============================================================================

Keeps MRR and cash apart and exposes the difference as its own column, rather
than leaving it to be worked out.

CREATE OR REPLACE VIEW public.billing_monthly_summary AS
WITH bounds AS (
  SELECT
    date_trunc('month', LEAST(
      COALESCE((SELECT min(occurred_at)    FROM public.billing_events), now()),
      COALESCE((SELECT min(effective_from) FROM public.billing_subscription_periods), now())
    )) AS start_m,
    date_trunc('month', now()) AS end_m,
    (EXISTS (SELECT 1 FROM public.billing_events)
     OR EXISTS (SELECT 1 FROM public.billing_subscription_periods)) AS has_data
),
months AS (
  SELECT generate_series(start_m, end_m, interval '1 month') AS month_start
  FROM bounds
  WHERE has_data
),
m AS (
  SELECT
    month_start,
    (month_start + interval '1 month')                        AS month_next,
    (month_start + interval '1 month' - interval '1 microsecond') AS month_end
  FROM months
)
SELECT
  m.month_start::date AS month,

  -- MRR as at the last instant of the month. Trials contribute zero.
  COALESCE((
    SELECT sum(public.billing_monthly_cents(
             p.unit_amount_cents, p.quantity, p.billing_interval,
             p.interval_count, p.discount_percent, p.discount_amount_cents))
    FROM public.billing_subscription_periods p
    WHERE p.effective_from <= m.month_end
      AND (p.effective_to IS NULL OR p.effective_to > m.month_end)
      AND p.status IN ('active','past_due')
  ), 0)::bigint AS mrr_cents,

  -- Cash actually collected in the month.
  COALESCE((
    SELECT sum(e.amount_cents) FROM public.billing_events e
    WHERE e.counts_as_cash
      AND e.occurred_at >= m.month_start AND e.occurred_at < m.month_next
  ), 0)::bigint AS cash_cents,

  -- The two biggest reasons the numbers differ.
  COALESCE((
    SELECT sum(e.amount_cents) FROM public.billing_events e
    WHERE e.counts_as_cash AND e.is_proration
      AND e.occurred_at >= m.month_start AND e.occurred_at < m.month_next
  ), 0)::bigint AS proration_cents,

  COALESCE((
    SELECT sum(e.amount_cents) FROM public.billing_events e
    WHERE e.event_type IN ('charge.refunded','charge.dispute')
      AND e.occurred_at >= m.month_start AND e.occurred_at < m.month_next
  ), 0)::bigint AS refund_cents,

  -- Explicit, so nobody has to derive it or wonder which way round it goes.
  (COALESCE((
     SELECT sum(e.amount_cents) FROM public.billing_events e
     WHERE e.counts_as_cash
       AND e.occurred_at >= m.month_start AND e.occurred_at < m.month_next
   ), 0)
   - COALESCE((
     SELECT sum(public.billing_monthly_cents(
              p.unit_amount_cents, p.quantity, p.billing_interval,
              p.interval_count, p.discount_percent, p.discount_amount_cents))
     FROM public.billing_subscription_periods p
     WHERE p.effective_from <= m.month_end
       AND (p.effective_to IS NULL OR p.effective_to > m.month_end)
       AND p.status IN ('active','past_due')
   ), 0))::bigint AS gap_cents,

  COALESCE((
    SELECT count(*) FROM public.billing_subscription_periods p
    WHERE p.effective_from <= m.month_end
      AND (p.effective_to IS NULL OR p.effective_to > m.month_end)
      AND p.status IN ('active','past_due')
  ), 0)::bigint AS active_subscriptions,

  COALESCE((
    SELECT count(*) FROM public.billing_subscription_periods p
    WHERE p.effective_to >= m.month_start AND p.effective_to < m.month_next
      AND p.cancellation_reason = 'voluntary'
  ), 0)::bigint AS churned_voluntary,

  COALESCE((
    SELECT count(*) FROM public.billing_subscription_periods p
    WHERE p.effective_to >= m.month_start AND p.effective_to < m.month_next
      AND p.cancellation_reason = 'involuntary'
  ), 0)::bigint AS churned_involuntary
FROM m
ORDER BY m.month_start DESC;

=============================================================================
8. RLS — platform admin only
=============================================================================

These tables are OUR revenue, not org data. No org member may read them.

IMPORTANT: please do not assume the predicate. Check whether a platform-admin
helper already exists and use it; only fall back to the hardcoded support email
(the pattern in 20260405205126) if there is no function. Then TELL ME which
branch was taken.

ALTER TABLE public.billing_events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscription_periods  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_backfill_jobs         ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_events               FROM anon, authenticated;
REVOKE ALL ON public.billing_subscription_periods FROM anon, authenticated;
REVOKE ALL ON public.billing_backfill_jobs        FROM anon, authenticated;

GRANT SELECT ON public.billing_events               TO authenticated;
GRANT SELECT ON public.billing_subscription_periods TO authenticated;
GRANT SELECT ON public.billing_monthly_summary      TO authenticated;
GRANT ALL    ON public.billing_events               TO service_role;
GRANT ALL    ON public.billing_subscription_periods TO service_role;
GRANT ALL    ON public.billing_backfill_jobs        TO service_role;

DO $do$
DECLARE
  v_pred text;
  t text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_platform_admin'
  ) THEN
    v_pred := 'public.is_platform_admin()';
    RAISE NOTICE 'Using existing public.is_platform_admin()';
  ELSE
    v_pred := 'EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() '
           || 'AND u.email = ''support@tidywisecleaning.com'')';
    RAISE NOTICE 'No is_platform_admin() found — falling back to hardcoded email';
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'billing_events','billing_subscription_periods','billing_backfill_jobs'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "Platform admin reads %1$s" ON public.%1$I '
      || 'FOR SELECT TO authenticated USING (%2$s)', t, v_pred);
  END LOOP;
END
$do$;

NOTE: no INSERT/UPDATE/DELETE policies for authenticated are created, deliberately.
Only edge functions (service_role) write, and service_role bypasses RLS.

=============================================================================
AFTERWARDS — please paste all of this back
=============================================================================

-- a) columns actually created
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public'
  and table_name in ('billing_events','billing_subscription_periods','billing_backfill_jobs')
order by table_name, ordinal_position;

-- b) THE MOST IMPORTANT CHECK: both FKs must read ON DELETE SET NULL.
--    If either says CASCADE, deleting an organization would destroy revenue
--    history, and delete-my-organization already deletes org-scoped rows.
select conrelid::regclass as table_name, conname,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.billing_events'::regclass,
                   'public.billing_subscription_periods'::regclass)
  and contype = 'f';

-- c) which platform-admin predicate was used
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname='public' and tablename like 'billing_%'
order by tablename;

-- d) append-only actually bites (both should ERROR, not return 0 rows)
--    Please run these and paste the error messages.
insert into public.billing_events
  (occurred_at, event_type, revenue_stream, stripe_object_id, amount_cents)
values (now(), 'adjustment', 'plan', 'test_append_only_probe', 1);
update public.billing_events set amount_cents = 2 where stripe_object_id='test_append_only_probe';
delete from public.billing_events where stripe_object_id='test_append_only_probe';

--    ^ the UPDATE and DELETE are EXPECTED TO FAIL with 42501. If they succeed,
--      the trigger is not working. Note the probe row will remain — that is
--      correct and expected for an append-only table; leave it, Task 2 ignores
--      unknown stripe_object_ids.

-- e) the view runs and returns zero rows on empty tables
select * from public.billing_monthly_summary;

-- f) normalisation sanity: all four should be 9700
select
  public.billing_monthly_cents(9700, 1, 'month', 1, null, null)  as monthly_97,
  public.billing_monthly_cents(116400, 1, 'year', 1, null, null) as annual_1164_div12,
  public.billing_monthly_cents(29100, 1, 'month', 3, null, null) as quarterly_291_div3,
  public.billing_monthly_cents(19400, 1, 'month', 1, 50, null)   as monthly_194_less_50pct;

Confirm the migration RAN, not just that a file was created.
````

---

## What to check when it comes back

**(b) is the one that matters.** If either FK says `CASCADE` instead of `SET NULL`, stop
and fix before Task 2 writes a single row — otherwise deleting an organisation silently
deletes its revenue history, which is the exact thing this whole project exists to
prevent.

**(d)** — the `UPDATE` and `DELETE` must both fail with `42501`. If either succeeds, the
append-only guarantee is decorative and the ledger can be rewritten.

**(f)** — all four must return `9700`. They check monthly pass-through, annual ÷12,
quarterly ÷3, and 50% discount respectively. A wrong number here means every MRR figure
built on it is wrong in a way that looks plausible.

**(c)** — note which predicate was used. If it fell back to the hardcoded email, that is
worth revisiting separately: a revenue table gated on one email address is fragile, and
you have a co-admin.
