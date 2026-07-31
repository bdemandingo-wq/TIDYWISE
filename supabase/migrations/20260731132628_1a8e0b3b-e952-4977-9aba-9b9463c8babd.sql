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
  'Normalises any Stripe recurring price to monthly cents, net of discount. Deliberately a function rather than a generated column: Postgres generated columns cannot reference other generated columns, and the MRR rule should be changeable without rewriting stored rows.';

CREATE TABLE public.billing_events (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at               timestamptz NOT NULL,
  synced_at                 timestamptz NOT NULL DEFAULT now(),
  event_type                text NOT NULL,
  revenue_stream            text NOT NULL,
  stripe_object_id          text NOT NULL,
  stripe_customer_id        text,
  stripe_subscription_id    text,
  stripe_invoice_id         text,
  stripe_payment_intent_id  text,
  stripe_charge_id          text,
  organization_id           uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  organization_name         text,
  customer_email            text,
  amount_cents              bigint NOT NULL,
  currency                  text NOT NULL DEFAULT 'usd',
  fee_cents                 bigint,
  net_cents                 bigint,
  counts_as_cash            boolean NOT NULL DEFAULT false,
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
  CONSTRAINT billing_events_object_uniq UNIQUE (stripe_object_id, event_type)
);

COMMENT ON TABLE public.billing_events IS
  'Append-only ledger of every platform money movement. Never UPDATE or DELETE — corrections are new rows with event_type = adjustment. Survives organization deletion by design (organization_id is ON DELETE SET NULL and identity is denormalised).';

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
  effective_to            timestamptz,
  cancellation_reason     text,
  cancellation_detail     text,
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
  'voluntary = Stripe cancellation_details.reason cancellation_requested. involuntary = payment_failed, i.e. dunning exhausted. Derived at ingest.';

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

CREATE OR REPLACE FUNCTION public.billing_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $t$
BEGIN
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
  COALESCE((
    SELECT sum(public.billing_monthly_cents(
             p.unit_amount_cents, p.quantity, p.billing_interval,
             p.interval_count, p.discount_percent, p.discount_amount_cents))
    FROM public.billing_subscription_periods p
    WHERE p.effective_from <= m.month_end
      AND (p.effective_to IS NULL OR p.effective_to > m.month_end)
      AND p.status IN ('active','past_due')
  ), 0)::bigint AS mrr_cents,
  COALESCE((
    SELECT sum(e.amount_cents) FROM public.billing_events e
    WHERE e.counts_as_cash
      AND e.occurred_at >= m.month_start AND e.occurred_at < m.month_next
  ), 0)::bigint AS cash_cents,
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