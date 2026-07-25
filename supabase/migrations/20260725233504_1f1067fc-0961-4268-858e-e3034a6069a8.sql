CREATE OR REPLACE FUNCTION public.refresh_peer_benchmark_snapshots()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period_start DATE := (CURRENT_DATE - INTERVAL '90 days')::date;
  v_inserted INTEGER := 0;
BEGIN
  CREATE TEMP TABLE _per_org ON COMMIT DROP AS
  WITH opted_orgs AS (
    SELECT bs.organization_id, bs.company_zip, bs.company_state
    FROM business_settings bs
    WHERE bs.benchmarks_opt_in = true
  )
  SELECT o.organization_id,
         o.company_zip   AS zip,
         o.company_state AS state,
         m.service_bucket, m.bookings_count, m.avg_price,
         m.cancel_rate, m.noshow_rate, m.repeat_rate,
         m.review_rate, m.avg_rating, m.recurring_share
  FROM opted_orgs o,
  LATERAL compute_org_benchmark_metrics(o.organization_id, v_period_start) m
  WHERE m.bookings_count >= 3;

  WITH cohorts AS (
    SELECT 'local'::text AS cohort_type, NULLIF(p.zip,'') AS cohort_key,
           p.organization_id, p.service_bucket, p.bookings_count, p.avg_price,
           p.cancel_rate, p.noshow_rate, p.repeat_rate,
           p.review_rate, p.avg_rating, p.recurring_share
    FROM _per_org p WHERE NULLIF(p.zip,'') IS NOT NULL
    UNION ALL
    SELECT 'regional'::text, NULLIF(p.state,''),
           p.organization_id, p.service_bucket, p.bookings_count, p.avg_price,
           p.cancel_rate, p.noshow_rate, p.repeat_rate,
           p.review_rate, p.avg_rating, p.recurring_share
    FROM _per_org p WHERE NULLIF(p.state,'') IS NOT NULL
    UNION ALL
    SELECT 'national'::text, 'US'::text,
           p.organization_id, p.service_bucket, p.bookings_count, p.avg_price,
           p.cancel_rate, p.noshow_rate, p.repeat_rate,
           p.review_rate, p.avg_rating, p.recurring_share
    FROM _per_org p
  ),
  agg AS (
    SELECT c.cohort_type, c.cohort_key, c.service_bucket,
           COUNT(DISTINCT c.organization_id) AS org_count,
           AVG(c.avg_price) AS avg_price,
           percentile_cont(0.5)  WITHIN GROUP (ORDER BY c.avg_price) AS median_price,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY c.avg_price) AS p25_price,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY c.avg_price) AS p75_price,
           AVG(c.cancel_rate) AS cancel_rate,
           AVG(c.noshow_rate) AS noshow_rate,
           AVG(c.repeat_rate) AS repeat_rate,
           AVG(c.review_rate) AS review_rate,
           AVG(c.avg_rating) AS avg_rating,
           AVG(c.recurring_share) AS recurring_share,
           AVG(c.bookings_count) AS bookings_per_org
    FROM cohorts c
    GROUP BY c.cohort_type, c.cohort_key, c.service_bucket
    HAVING COUNT(DISTINCT c.organization_id) >= 5
  )
  INSERT INTO peer_benchmark_snapshots (
    period_start, cohort_type, cohort_key, service_bucket, org_count,
    avg_price, median_price, p25_price, p75_price,
    cancel_rate, noshow_rate, repeat_rate, review_rate,
    avg_rating, recurring_share, bookings_per_org
  )
  SELECT v_period_start, a.cohort_type, a.cohort_key, a.service_bucket, a.org_count,
         a.avg_price, a.median_price, a.p25_price, a.p75_price,
         a.cancel_rate, a.noshow_rate, a.repeat_rate, a.review_rate,
         a.avg_rating, a.recurring_share, a.bookings_per_org
  FROM agg a
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
$function$;