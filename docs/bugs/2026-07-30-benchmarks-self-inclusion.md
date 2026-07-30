# Benchmarks: yes, an org's own data is inside its own peer comparison

**Audited:** 2026-07-30. Read-only, nothing fixed.
**Answer to the question:** **Yes — structurally, on every cohort, with no exclusion anywhere.**
**Severity:** scales inversely with cohort size. Negligible nationally, up to 20% locally.

---

## The mechanism

`refresh_peer_benchmark_snapshots()` (latest `20260725233504…sql`) builds **one
aggregate row per cohort**, not per org:

```sql
WITH opted_orgs AS (
  SELECT organization_id, company_zip, company_state
  FROM business_settings WHERE benchmarks_opt_in = true
)
-- fans every opted-in org into local / regional / national cohorts, then:
GROUP BY c.cohort_type, c.cohort_key, c.service_bucket
HAVING COUNT(DISTINCT c.organization_id) >= 5
```

There is no `WHERE organization_id <> …` anywhere, and no per-org variant of the
snapshot. `get_org_benchmarks(p_org_id, …)` (`20260509081441…sql:222-234`) then
selects that same shared cohort row and hands it back as `peers`.

So the caller's own metrics are inside the `avg_price`, `median_price`,
`p25_price`, `p75_price`, `cancel_rate`, `noshow_rate`, `repeat_rate`,
`review_rate`, `avg_rating` and `recurring_share` that get labelled "peers" and
displayed next to their own `my_metrics`.

This is not a missed filter — the snapshot table is keyed
`(period_start, cohort_type, cohort_key, service_bucket)` with no org column, so
there is nowhere for a leave-one-out figure to live in the current schema.

## Why it matters, and in which direction

`HAVING COUNT(DISTINCT organization_id) >= 5` sets the floor at five orgs. So in
the smallest permitted cohort the caller is **20% of their own benchmark**.

The bias always runs the same way: **toward "you are more normal than you are."**
The caller's value pulls the peer average toward itself, shrinking every gap the
product exists to reveal.

- An org overcharging by 15% sees a peer average dragged up toward its own price,
  so the gap displays as smaller than it is.
- An org with a bad cancel rate inflates the peer cancel rate it is judged
  against, and looks less of an outlier.

The percentiles are worse than the mean at small k, not better. **At k=5 the
caller is one of five data points, so they can literally BE the median** — the
screen then shows "your price $X / peer median $X", perfect alignment that is a
pure artifact of self-inclusion.

Cohort sizes and the resulting self-weight:

| Cohort | Likely size | Caller's own weight |
|---|---|---|
| local (ZIP) | 5–8 | **12–20%** |
| regional (state) | 5–20 | 5–20% |
| national (`US`) | tens | ~1–3%, negligible |

The severity is inverted against the value: the local ZIP cohort is both the most
distorted and the one owners care most about, because "how do I compare to the
firms actually near me" is the question the feature is for.

## The copy actively implies the opposite

`BenchmarkInsightsPanel.tsx:69-73`:

> "Not enough peer data in this cohort yet. Insights will unlock when at least 5
> similar businesses share data."

"5 similar businesses" reads as five *others*. The threshold counts the caller, so
it unlocks at **four others plus you**. Nothing anywhere on the page says the peer
figures include your own numbers, and `BenchmarksPage.tsx:122` describes the
feature as "See how your business compares to anonymous peers."

Related: if `>= 5` was chosen as a k-anonymity threshold, the effective anonymity
set is **4 other orgs**, not 5. Worth confirming that was the intent.

---

## Options, in ascending cost

Not fixing — this needs a product decision and all three routes are Lovable work.

1. **Disclose it.** Change the copy to say the comparison includes your own
   business and show `org_count` next to each figure. Zero schema change, honest,
   and arguably enough at national scale. Does not fix the local distortion.

2. **Leave-one-out for the means.** Store `SUM` and `COUNT` per cohort instead of
   (or alongside) `AVG`, then compute `(sum - my_value) / (count - 1)` at read
   time in `get_org_benchmarks`. Exact for every mean. **Does not work for
   `median`/`p25`/`p75`** — percentiles cannot be un-mixed from an aggregate, so
   those would still be self-inclusive unless dropped or handled by (3).

3. **Per-org snapshots.** Materialise one row per `(org, cohort, bucket)` with
   that org excluded. Exact for percentiles too. Costs roughly
   `orgs × cohorts × buckets` rows and a heavier refresh, which for ~87 orgs is
   still small.

My read: **(1) immediately regardless of what else happens** — it costs nothing
and the current copy is misleading in a product whose only job is honest
comparison. Then (2) if the means are what drive the insights, or (3) if the
percentile bands are load-bearing in the UI.

Worth checking before choosing: how many orgs actually have
`benchmarks_opt_in = true`, and what the real local cohort sizes are. If only a
handful are opted in, the local cohorts may not be clearing `>= 5` at all and the
whole question is currently theoretical:

```sql
select count(*) filter (where benchmarks_opt_in) as opted_in,
       count(*)                                  as total
from public.business_settings;

select cohort_type, cohort_key, service_bucket, org_count, period_start
from public.peer_benchmark_snapshots
order by org_count asc, cohort_type
limit 30;
```

The lowest `org_count` rows are where the distortion is worst.
