# AI Business Benchmarking

Show every TidyWise owner how their business stacks up against anonymous peers (same ZIP, same service type, similar size), with AI-generated explanations and recommendations.

## What the owner sees

A new **Benchmarks** page (admin sidebar + mobile nav) with:

1. **Headline cards** — each shows your value, the peer median, and a delta:
   - Avg price per service type (Standard, Deep, Move-in/out, Airbnb, Recurring)
   - Avg ticket size
   - Cancellation rate (last 90 days)
   - No-show rate
   - Repeat customer rate
   - Reviews per completed job
   - Avg rating
   - Recurring customer share

2. **Peer group selector** — Local (same ZIP/metro), Regional (state), National. Defaults to the smallest group with ≥5 peers (k-anonymity).

3. **AI insights panel** — calls Lovable AI Gateway with the owner's metrics + peer aggregates and returns 3–5 plain-English bullets like "You're charging 18% below the local median for deep cleans — raising to $X would add ~$Y/month at current volume" and "Your cancellation rate is 3x peers; the most common cause among similar orgs is no card-on-file at booking."

4. **Trend sparkline** per metric (your value vs peer median over the last 6 months).

## Privacy model (non-negotiable)

- Aggregates only. No org names, no customer names, no addresses. Ever.
- Minimum cohort size of 5 orgs for any aggregate; below that the slice is hidden.
- Org IDs and ZIPs are hashed in the aggregate cache; raw IDs never leave the server.
- Owners can opt out via a single toggle in business settings (`benchmarks_opt_in`, default ON). Opted-out orgs neither contribute nor receive comparisons.
- All queries run inside a single SECURITY DEFINER RPC with hard-coded aggregations — no raw row access from the client.

## Technical sections

### Data sources (already in DB)

- `bookings` (status, total_amount, scheduled_at, service_id, organization_id, zip_code, customer_id)
- `services` (name → service-type bucket)
- `customers` (for repeat detection, never returned)
- `review_requests` (rating, status)
- `organizations` (zip + state for cohort grouping)
- `business_settings` (timezone, plus new `benchmarks_opt_in` column)

### Migration

- Add `business_settings.benchmarks_opt_in BOOLEAN DEFAULT TRUE`.
- Create materialized view `peer_benchmark_snapshots` keyed by `(period, cohort_type, cohort_key, service_bucket)` storing: median/avg price, p25/p75, cancel_rate, noshow_rate, repeat_rate, review_rate, avg_rating, recurring_share, `org_count`. Refreshed nightly via scheduled edge function.
- Create SECURITY DEFINER RPC `get_org_benchmarks(p_org_id uuid, p_cohort text)` returning the org's own metrics plus the matching peer aggregates, but only where `org_count >= 5`. RLS denies the materialized view to clients; only the RPC reads it.

### Edge functions

- `refresh-benchmark-snapshots` — nightly cron. Recomputes the materialized view from the last 90 days of data, only including opted-in orgs.
- `benchmark-ai-insights` — POST `{ org_metrics, peer_metrics, cohort }`. Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with a tight system prompt and returns structured `{ insights: [{ title, body, severity, suggested_action }] }` via AI SDK `Output`. Server-only; never exposes peer data beyond what the RPC already sanitized.

### Frontend

- New route `/admin/benchmarks` → `BenchmarksPage.tsx`
- Components: `BenchmarkHeadlineCard`, `BenchmarkPeerSelector`, `BenchmarkInsightsPanel`, `BenchmarkTrendChart` (recharts, already in project).
- React Query hook `useOrgBenchmarks(cohort)` — calls the RPC, scoped to `organization.id` per the project's isolation rule.
- Sidebar entry under Operations; mobile nav module mapping added.
- Settings → Business: toggle for `benchmarks_opt_in` with a one-line privacy explanation.

### Out of scope (this pass)

- Per-staff benchmarking, public/share URLs, exports, custom cohort builder.
- Historical backfill beyond 90 days (the snapshot job will start fresh).

## Deliverables

1. Migration: `benchmarks_opt_in` column + `peer_benchmark_snapshots` materialized view + `get_org_benchmarks` RPC + RLS.
2. Edge functions: `refresh-benchmark-snapshots`, `benchmark-ai-insights`.
3. Frontend: `BenchmarksPage` + 4 components + hook + nav entries + settings toggle.
4. Cron schedule entry for nightly refresh (2am org-local time → 06:00 UTC default).
