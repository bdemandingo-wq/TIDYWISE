
-- 1. Opt-in column
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS benchmarks_opt_in BOOLEAN NOT NULL DEFAULT true;

-- 2. Snapshot table (no client RLS access; only RPC reads it)
CREATE TABLE IF NOT EXISTS public.peer_benchmark_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  cohort_type TEXT NOT NULL CHECK (cohort_type IN ('local','regional','national')),
  cohort_key TEXT NOT NULL,
  service_bucket TEXT NOT NULL DEFAULT 'all',
  org_count INTEGER NOT NULL DEFAULT 0,
  avg_price NUMERIC,
  median_price NUMERIC,
  p25_price NUMERIC,
  p75_price NUMERIC,
  cancel_rate NUMERIC,
  noshow_rate NUMERIC,
  repeat_rate NUMERIC,
  review_rate NUMERIC,
  avg_rating NUMERIC,
  recurring_share NUMERIC,
  bookings_per_org NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_start, cohort_type, cohort_key, service_bucket)
);

CREATE INDEX IF NOT EXISTS idx_pbs_lookup
  ON public.peer_benchmark_snapshots (cohort_type, cohort_key, service_bucket, period_start DESC);

ALTER TABLE public.peer_benchmark_snapshots ENABLE ROW LEVEL SECURITY;

-- Deny all client access; only SECURITY DEFINER functions read
DROP POLICY IF EXISTS "no_direct_access" ON public.peer_benchmark_snapshots;
CREATE POLICY "no_direct_access"
  ON public.peer_benchmark_snapshots
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- 3. Helper: classify a service into a bucket
CREATE OR REPLACE FUNCTION public.classify_service_bucket(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_name IS NULL THEN 'other'
    WHEN p_name ILIKE '%deep%' THEN 'deep'
    WHEN p_name ILIKE '%move%' THEN 'move_in_out'
    WHEN p_name ILIKE '%airbnb%' OR p_name ILIKE '%turn%' THEN 'airbnb'
    WHEN p_name ILIKE '%post%construction%' OR p_name ILIKE '%construction%' THEN 'post_construction'
    WHEN p_name ILIKE '%recurring%' OR p_name ILIKE '%maintenance%' THEN 'recurring'
    WHEN p_name ILIKE '%standard%' OR p_name ILIKE '%regular%' OR p_name ILIKE '%basic%' THEN 'standard'
    ELSE 'other'
  END
$$;

-- 4. Compute one org's metrics for a 90-day window
CREATE OR REPLACE FUNCTION public.compute_org_benchmark_metrics(
  p_org_id UUID,
  p_period_start DATE
)
RETURNS TABLE (
  service_bucket TEXT,
  bookings_count INTEGER,
  avg_price NUMERIC,
  cancel_rate NUMERIC,
  noshow_rate NUMERIC,
  repeat_rate NUMERIC,
  review_rate NUMERIC,
  avg_rating NUMERIC,
  recurring_share NUMERIC
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ := p_period_start::timestamptz;
  v_window_end TIMESTAMPTZ := (p_period_start + INTERVAL '90 days')::timestamptz;
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      b.id, b.status::text AS status, b.total_amount, b.customer_id, b.frequency,
      classify_service_bucket(s.name) AS bucket
    FROM bookings b
    LEFT JOIN services s ON s.id = b.service_id
    WHERE b.organization_id = p_org_id
      AND b.scheduled_at >= v_window_start
      AND b.scheduled_at < v_window_end
      AND COALESCE(b.is_test, false) = false
      AND COALESCE(b.is_draft, false) = false
  ),
  per_bucket AS (
    SELECT bucket,
           COUNT(*) FILTER (WHERE status NOT IN ('cancelled','no_show')) AS completed_or_active,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
           COUNT(*) FILTER (WHERE status = 'no_show') AS noshow,
           AVG(total_amount) FILTER (WHERE status NOT IN ('cancelled','no_show')) AS avg_price_b,
           COUNT(DISTINCT customer_id) AS unique_customers,
           COUNT(DISTINCT customer_id) FILTER (WHERE status NOT IN ('cancelled','no_show')) AS active_customers,
           COUNT(*) FILTER (WHERE COALESCE(frequency,'one_time') NOT IN ('one_time','one-time','')) AS recurring_count
    FROM base
    GROUP BY bucket
  ),
  reviews AS (
    SELECT classify_service_bucket(s.name) AS bucket,
           COUNT(*) FILTER (WHERE rr.status = 'responded') AS responded,
           COUNT(*) AS sent,
           AVG(rr.rating) FILTER (WHERE rr.rating IS NOT NULL) AS avg_rating
    FROM review_requests rr
    JOIN bookings b ON b.id = rr.booking_id
    LEFT JOIN services s ON s.id = b.service_id
    WHERE b.organization_id = p_org_id
      AND b.scheduled_at >= v_window_start
      AND b.scheduled_at < v_window_end
    GROUP BY classify_service_bucket(s.name)
  ),
  repeat_rates AS (
    SELECT bucket,
           CASE WHEN COUNT(DISTINCT customer_id) > 0
             THEN COUNT(DISTINCT customer_id) FILTER (WHERE customer_bookings > 1)::numeric
                / COUNT(DISTINCT customer_id)
             ELSE NULL
           END AS repeat_rate
    FROM (
      SELECT bucket, customer_id, COUNT(*) AS customer_bookings
      FROM base
      WHERE customer_id IS NOT NULL
      GROUP BY bucket, customer_id
    ) cb
    GROUP BY bucket
  )
  SELECT
    pb.bucket,
    pb.total::int,
    pb.avg_price_b,
    CASE WHEN pb.total > 0 THEN pb.cancelled::numeric / pb.total ELSE NULL END,
    CASE WHEN pb.total > 0 THEN pb.noshow::numeric / pb.total ELSE NULL END,
    rr.repeat_rate,
    CASE WHEN COALESCE(rev.sent,0) > 0 THEN rev.responded::numeric / rev.sent ELSE NULL END,
    rev.avg_rating,
    CASE WHEN pb.total > 0 THEN pb.recurring_count::numeric / pb.total ELSE NULL END
  FROM per_bucket pb
  LEFT JOIN reviews rev ON rev.bucket = pb.bucket
  LEFT JOIN repeat_rates rr ON rr.bucket = pb.bucket;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_org_benchmark_metrics(UUID, DATE) FROM PUBLIC, anon, authenticated;

-- 5. The user-facing RPC
CREATE OR REPLACE FUNCTION public.get_org_benchmarks(
  p_org_id UUID,
  p_cohort TEXT DEFAULT 'auto'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_member BOOLEAN;
  v_org_zip TEXT;
  v_org_state TEXT;
  v_opted_in BOOLEAN;
  v_period_start DATE;
  v_my_metrics jsonb;
  v_peer_local jsonb;
  v_peer_regional jsonb;
  v_peer_national jsonb;
BEGIN
  -- Only org members may query their own org
  SELECT EXISTS (
    SELECT 1 FROM org_memberships
    WHERE organization_id = p_org_id AND user_id = auth.uid()
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT bs.benchmarks_opt_in,
         COALESCE(NULLIF(bs.company_zip,''), '') ,
         COALESCE(NULLIF(bs.company_state,''), '')
  INTO v_opted_in, v_org_zip, v_org_state
  FROM business_settings bs
  WHERE bs.organization_id = p_org_id
  LIMIT 1;

  IF v_opted_in IS NOT TRUE THEN
    RETURN jsonb_build_object('opted_in', false);
  END IF;

  v_period_start := (CURRENT_DATE - INTERVAL '90 days')::date;

  -- Caller's own metrics
  SELECT jsonb_agg(jsonb_build_object(
    'service_bucket', m.service_bucket,
    'bookings_count', m.bookings_count,
    'avg_price', m.avg_price,
    'cancel_rate', m.cancel_rate,
    'noshow_rate', m.noshow_rate,
    'repeat_rate', m.repeat_rate,
    'review_rate', m.review_rate,
    'avg_rating', m.avg_rating,
    'recurring_share', m.recurring_share
  ))
  FROM compute_org_benchmark_metrics(p_org_id, v_period_start) m
  INTO v_my_metrics;

  -- Helper: most recent snapshot per cohort (k>=5 enforced at write time)
  WITH latest AS (
    SELECT DISTINCT ON (cohort_type, cohort_key, service_bucket) *
    FROM peer_benchmark_snapshots
    WHERE org_count >= 5
    ORDER BY cohort_type, cohort_key, service_bucket, period_start DESC
  )
  SELECT
    jsonb_agg(to_jsonb(l)) FILTER (WHERE l.cohort_type='local' AND l.cohort_key = v_org_zip),
    jsonb_agg(to_jsonb(l)) FILTER (WHERE l.cohort_type='regional' AND l.cohort_key = v_org_state),
    jsonb_agg(to_jsonb(l)) FILTER (WHERE l.cohort_type='national' AND l.cohort_key = 'US')
  INTO v_peer_local, v_peer_regional, v_peer_national
  FROM latest l;

  RETURN jsonb_build_object(
    'opted_in', true,
    'period_start', v_period_start,
    'cohort_keys', jsonb_build_object(
      'local', v_org_zip,
      'regional', v_org_state,
      'national', 'US'
    ),
    'my_metrics', COALESCE(v_my_metrics, '[]'::jsonb),
    'peers', jsonb_build_object(
      'local', COALESCE(v_peer_local, '[]'::jsonb),
      'regional', COALESCE(v_peer_regional, '[]'::jsonb),
      'national', COALESCE(v_peer_national, '[]'::jsonb)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_benchmarks(UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_org_benchmarks(UUID, TEXT) FROM anon, PUBLIC;

-- 6. Refresh function (called by scheduled edge function with service role)
CREATE OR REPLACE FUNCTION public.refresh_peer_benchmark_snapshots()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start DATE := (CURRENT_DATE - INTERVAL '90 days')::date;
  v_inserted INTEGER := 0;
BEGIN
  -- Build per-org metrics for opted-in orgs
  CREATE TEMP TABLE _per_org ON COMMIT DROP AS
  WITH opted_orgs AS (
    SELECT bs.organization_id, bs.company_zip, bs.company_state
    FROM business_settings bs
    WHERE bs.benchmarks_opt_in = true
  )
  SELECT o.organization_id, o.company_zip AS zip, o.company_state AS state, m.*
  FROM opted_orgs o,
  LATERAL compute_org_benchmark_metrics(o.organization_id, v_period_start) m
  WHERE m.bookings_count >= 3; -- minimum signal per org

  -- Aggregate across cohorts
  WITH cohorts AS (
    -- local: by zip
    SELECT 'local'::text AS cohort_type, NULLIF(zip,'') AS cohort_key, service_bucket, * FROM _per_org WHERE NULLIF(zip,'') IS NOT NULL
    UNION ALL
    SELECT 'regional', NULLIF(state,''), service_bucket, * FROM _per_org WHERE NULLIF(state,'') IS NOT NULL
    UNION ALL
    SELECT 'national', 'US', service_bucket, * FROM _per_org
  ),
  agg AS (
    SELECT
      cohort_type, cohort_key, service_bucket,
      COUNT(DISTINCT organization_id) AS org_count,
      AVG(avg_price) AS avg_price,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY avg_price) AS median_price,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY avg_price) AS p25_price,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY avg_price) AS p75_price,
      AVG(cancel_rate) AS cancel_rate,
      AVG(noshow_rate) AS noshow_rate,
      AVG(repeat_rate) AS repeat_rate,
      AVG(review_rate) AS review_rate,
      AVG(avg_rating) AS avg_rating,
      AVG(recurring_share) AS recurring_share,
      AVG(bookings_count) AS bookings_per_org
    FROM cohorts
    GROUP BY cohort_type, cohort_key, service_bucket
    HAVING COUNT(DISTINCT organization_id) >= 5
  )
  INSERT INTO peer_benchmark_snapshots (
    period_start, cohort_type, cohort_key, service_bucket, org_count,
    avg_price, median_price, p25_price, p75_price,
    cancel_rate, noshow_rate, repeat_rate, review_rate, avg_rating, recurring_share, bookings_per_org
  )
  SELECT v_period_start, cohort_type, cohort_key, service_bucket, org_count,
         avg_price, median_price, p25_price, p75_price,
         cancel_rate, noshow_rate, repeat_rate, review_rate, avg_rating, recurring_share, bookings_per_org
  FROM agg
  ON CONFLICT (period_start, cohort_type, cohort_key, service_bucket) DO UPDATE SET
    org_count = EXCLUDED.org_count,
    avg_price = EXCLUDED.avg_price,
    median_price = EXCLUDED.median_price,
    p25_price = EXCLUDED.p25_price,
    p75_price = EXCLUDED.p75_price,
    cancel_rate = EXCLUDED.cancel_rate,
    noshow_rate = EXCLUDED.noshow_rate,
    repeat_rate = EXCLUDED.repeat_rate,
    review_rate = EXCLUDED.review_rate,
    avg_rating = EXCLUDED.avg_rating,
    recurring_share = EXCLUDED.recurring_share,
    bookings_per_org = EXCLUDED.bookings_per_org;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_peer_benchmark_snapshots() FROM PUBLIC, anon, authenticated;
