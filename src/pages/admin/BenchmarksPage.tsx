import { useMemo, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useOrgId } from '@/hooks/useOrgId';
import { useBenchmarks, type CohortType, type ServiceBucket } from '@/hooks/useBenchmarks';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Loader2, Gauge, Lock, Users } from 'lucide-react';
import { BenchmarkHeadlineCard } from '@/components/admin/benchmarks/BenchmarkHeadlineCard';
import { BenchmarkInsightsPanel } from '@/components/admin/benchmarks/BenchmarkInsightsPanel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const BUCKET_LABELS: Record<ServiceBucket, string> = {
  standard: 'Standard',
  deep: 'Deep clean',
  move_in_out: 'Move in / out',
  airbnb: 'Airbnb turnover',
  recurring: 'Recurring',
  post_construction: 'Post-construction',
  other: 'Other',
};

const ALL_BUCKETS: ServiceBucket[] = [
  'standard',
  'deep',
  'move_in_out',
  'airbnb',
  'recurring',
  'post_construction',
  'other',
];

export default function BenchmarksPage() {
  const { organizationId } = useOrgId();
  const { data, isLoading } = useBenchmarks(organizationId);
  const [cohort, setCohort] = useState<CohortType>('local');
  const [bucket, setBucket] = useState<ServiceBucket>('standard');

  const myMetrics = data?.my_metrics ?? [];
  const peerCohort = (data?.peers?.[cohort] ?? []) as any[];

  const myForBucket = useMemo(
    () => myMetrics.find((m) => m.service_bucket === bucket) ?? null,
    [myMetrics, bucket],
  );
  const peerForBucket = useMemo(
    () => peerCohort.find((p) => p.service_bucket === bucket) ?? null,
    [peerCohort, bucket],
  );

  // Aggregate "All services" cards
  const myAll = useMemo(() => {
    if (myMetrics.length === 0) return null;
    const total = myMetrics.reduce((s, m) => s + (m.bookings_count ?? 0), 0);
    const safe = (key: keyof typeof myMetrics[0]) => {
      let weighted = 0;
      let weight = 0;
      for (const m of myMetrics) {
        const w = m.bookings_count ?? 0;
        const v = (m[key] as number | null) ?? null;
        if (v != null && w > 0) {
          weighted += v * w;
          weight += w;
        }
      }
      return weight > 0 ? weighted / weight : null;
    };
    return {
      bookings_count: total,
      avg_price: safe('avg_price'),
      cancel_rate: safe('cancel_rate'),
      noshow_rate: safe('noshow_rate'),
      repeat_rate: safe('repeat_rate'),
      review_rate: safe('review_rate'),
      avg_rating: safe('avg_rating'),
      recurring_share: safe('recurring_share'),
    };
  }, [myMetrics]);

  const peerAll = useMemo(() => {
    if (peerCohort.length === 0) return null;
    const totalOrgs = Math.max(...peerCohort.map((p) => p.org_count ?? 0));
    const avg = (key: string) => {
      const vals = peerCohort.map((p) => p[key]).filter((v) => typeof v === 'number');
      if (vals.length === 0) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    // Avg ticket must be booking-weighted to match the "you" side (myAll,
    // weighted by bookings_count per bucket). Peer weight per bucket =
    // bookings_per_org * org_count = total bookings in that bucket.
    const weightedAvgPrice = (() => {
      let weighted = 0;
      let weight = 0;
      for (const p of peerCohort) {
        const price = typeof p.avg_price === 'number' ? p.avg_price : null;
        const w = (p.bookings_per_org ?? 0) * (p.org_count ?? 0);
        if (price != null && w > 0) {
          weighted += price * w;
          weight += w;
        }
      }
      return weight > 0 ? weighted / weight : null;
    })();
    return {
      org_count: totalOrgs,
      avg_price: weightedAvgPrice,
      median_price: avg('median_price'),
      cancel_rate: avg('cancel_rate'),
      noshow_rate: avg('noshow_rate'),
      repeat_rate: avg('repeat_rate'),
      review_rate: avg('review_rate'),
      avg_rating: avg('avg_rating'),
      recurring_share: avg('recurring_share'),
    };
  }, [peerCohort]);

  return (
    <AdminLayout title="Benchmarks">
<div className="portal-v2 portal-v2-scroll">
      <SEOHead title="Benchmarks · TidyWise" description="See how your business compares to anonymous peers." noIndex />
      <div className="space-y-6 max-w-6xl mx-auto">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold">Benchmarks</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            How your last 90 days compare to all participating businesses, including your own.
            All data is aggregated; no organization names, customers, or addresses are ever shared.
          </p>
        </div>

        {isLoading && (
          <Card className="p-10 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </Card>
        )}

        {!isLoading && data?.opted_in === false && (
          <Card className="p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Benchmarks are off for your organization</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Benchmarks are anonymous and aggregate-only. Turn them on in Settings → Business to
              see how you stack up.
            </p>
            <Button asChild size="sm">
              <Link to="/dashboard/settings">Open settings</Link>
            </Button>
          </Card>
        )}

        {!isLoading && data?.opted_in && (
          <>
            <Card className="p-4 flex flex-wrap items-center gap-3 justify-between">
              <Tabs value={cohort} onValueChange={(v) => setCohort(v as CohortType)}>
                <TabsList>
                  <TabsTrigger value="local">Local ({data.cohort_keys?.local || '—'})</TabsTrigger>
                  <TabsTrigger value="regional">State ({data.cohort_keys?.regional || '—'})</TabsTrigger>
                  <TabsTrigger value="national">National</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {peerAll?.org_count ? `${peerAll.org_count} participating businesses` : 'Cohort too small'}
                </div>
                <Select value={bucket} onValueChange={(v) => setBucket(v as ServiceBucket)}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_BUCKETS.map((b) => (
                      <SelectItem key={b} value={b}>{BUCKET_LABELS[b]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {peerCohort.length === 0 ? (
              <Card className="p-6">
                <h3 className="font-semibold mb-1">Not enough peers in this cohort yet</h3>
                <p className="text-sm text-muted-foreground">
                  We require at least 5 participating businesses before we show benchmarks for a
                  given cohort. Try a broader cohort, or check back soon.
                </p>
              </Card>
            ) : (
              <>
                {/* Overall row */}
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground mb-2">All services (last 90 days)</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <BenchmarkHeadlineCard label="Avg ticket" yourValue={myAll?.avg_price} peerValue={peerAll?.avg_price} format="currency" />
                    <BenchmarkHeadlineCard label="Cancellation rate" yourValue={myAll?.cancel_rate} peerValue={peerAll?.cancel_rate} format="percent" lowerIsBetter />
                    <BenchmarkHeadlineCard label="No-show rate" yourValue={myAll?.noshow_rate} peerValue={peerAll?.noshow_rate} format="percent" lowerIsBetter />
                    <BenchmarkHeadlineCard label="Repeat customer rate" yourValue={myAll?.repeat_rate} peerValue={peerAll?.repeat_rate} format="percent" />
                    <BenchmarkHeadlineCard label="Recurring share" yourValue={myAll?.recurring_share} peerValue={peerAll?.recurring_share} format="percent" />
                    <BenchmarkHeadlineCard label="Review response rate" yourValue={myAll?.review_rate} peerValue={peerAll?.review_rate} format="percent" />
                    <BenchmarkHeadlineCard label="Avg rating" yourValue={myAll?.avg_rating} peerValue={peerAll?.avg_rating} format="rating" />
                    <BenchmarkHeadlineCard label={`Bookings in ${BUCKET_LABELS[bucket]} (you / peer avg)`} yourValue={myForBucket?.bookings_count} peerValue={peerForBucket?.bookings_per_org ?? null} format="number" />
                  </div>
                </div>

                {/* Per-service-bucket */}
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground mb-2">
                    {BUCKET_LABELS[bucket]} pricing
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <BenchmarkHeadlineCard label="Your avg price" yourValue={myForBucket?.avg_price} peerValue={peerForBucket?.median_price} format="currency" helper="vs peer median" />
                    <BenchmarkHeadlineCard label="Peer 25th pct" yourValue={peerForBucket?.p25_price} peerValue={peerForBucket?.p25_price} format="currency" />
                    <BenchmarkHeadlineCard label="Peer 75th pct" yourValue={peerForBucket?.p75_price} peerValue={peerForBucket?.p75_price} format="currency" />
                  </div>
                </div>

                {organizationId && (
                  <BenchmarkInsightsPanel
                    organizationId={organizationId}
                    cohort={cohort}
                    myMetrics={myMetrics}
                    peerMetrics={peerCohort as any}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
</AdminLayout>
  );
}
