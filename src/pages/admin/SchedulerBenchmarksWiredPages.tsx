import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { queryPhase } from '@/lib/queryState';
import { customerDisplayName } from '@/lib/customerStatus';
import { Card, CardTitle, StatCard, SimpleListView, type SimpleListRow } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/* ── Scheduler: one day's agenda ───────────────────────────────────────────
   The 6a/6b comps are a month grid plus a day agenda. The agenda is the part
   that carries information at 390px; the grid is navigation.

   Days are computed in the ORG's timezone. A booking at 8am in Florida must
   not fall on the previous day for someone looking from California, and
   `new Date(iso).toDateString()` on the device does exactly that — which is
   what the repo's local/no-device-local-dates rule exists to stop.
   ────────────────────────────────────────────────────────────────────────── */
export function SchedulerWiredPage() {
  const { organization } = useOrganization();
  const orgTz = useOrgTimezone();

  const dayKey = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: orgTz || 'UTC',
    });
    return (d: Date) => f.format(d);
  }, [orgTz]);

  const [selected, setSelected] = useState<string>(() => dayKey(new Date()));

  const q = useQuery({
    queryKey: ['scheduler-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, total_amount,
          customer:customers(first_name, last_name),
          service:services(name),
          staff:staff(name)
        `)
        .eq('organization_id', organization.id)
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const phase = queryPhase(q);

  const byDay = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const b of (q.data ?? []) as any[]) {
      const k = dayKey(new Date(b.scheduled_at));
      const list = m.get(k) ?? [];
      list.push(b);
      m.set(k, list);
    }
    return m;
  }, [q.data, dayKey]);

  /* Days that actually have work, so the picker offers real options rather
     than an empty calendar to hunt through. */
  const daysWithWork = useMemo(
    () => [...byDay.keys()].sort(),
    [byDay],
  );

  const fmtTime = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: orgTz || 'UTC',
    });
    return (iso: string) => f.format(new Date(iso));
  }, [orgTz]);

  const fmtDayLabel = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
    });
    return (k: string) => f.format(new Date(`${k}T12:00:00Z`));
  }, []);

  const todays = byDay.get(selected) ?? [];

  const rows: SimpleListRow[] = todays.map((b: any) => ({
    id: b.id,
    title: fmtTime(b.scheduled_at),
    meta: b.service?.name ?? 'No service',
    lines: [
      customerDisplayName(b.customer?.first_name, b.customer?.last_name) ?? 'Unknown customer',
      b.staff?.name ? b.staff.name : 'Unassigned',
      b.duration ? `${b.duration} min` : null,
    ],
    money: b.total_amount === null ? undefined : `$${Number(b.total_amount).toFixed(2)}`,
  }));

  const listState: ListState =
    phase === 'error' || phase === 'offline' ? 'error'
      : phase === 'loading' ? 'loading'
      : rows.length === 0 ? 'empty' : 'ready';

  return (
    <AdminLayout title="Scheduler" subtitle="Mobile layout, live data">
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        {phase === 'ready' && (
          <div className="px-4 pt-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {daysWithWork.slice(0, 14).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelected(k)}
                  className={
                    'shrink-0 rounded-full px-3 py-1.5 text-[11.5px] ' +
                    (k === selected
                      ? 'bg-[hsl(var(--pv-brand))] font-bold text-[hsl(var(--pv-brand-ink))]'
                      : 'border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] font-semibold text-[hsl(var(--pv-ink-2))]')
                  }
                >
                  {fmtDayLabel(k)} · {byDay.get(k)?.length ?? 0}
                </button>
              ))}
            </div>
            {daysWithWork.length === 0 && (
              <p className="py-2 text-[11.5px] font-semibold text-[hsl(var(--pv-ink-3))]">
                No bookings on any day.
              </p>
            )}
          </div>
        )}

        <SimpleListView
          title="Scheduler"
          phase={listState}
          rows={rows}
          search=""
          onSearch={() => undefined}
          emptyTitle={`Nothing booked on ${fmtDayLabel(selected)}`}
          emptyHint="Pick another day above, or add a booking."
          errorLabel="Couldn't load the schedule"
          addLabel="New booking"
          onRetry={() => q.refetch()}
          sectionLabel={`${fmtDayLabel(selected)} · ${rows.length} job${rows.length === 1 ? '' : 's'}`}
        />
      </div>
    </AdminLayout>
  );
}

/* ── Benchmarks ────────────────────────────────────────────────────────────
   THE FINDING: there is almost nobody to compare against.

   get_org_benchmarks returns three cohorts. Measured live:

       local (zip 33442)   0 peers
       regional (FL)       0 peers
       national (US)       2 peers

   Two businesses nationally is not a benchmark. Reporting a "peer average"
   from two organisations is close to publishing a named competitor's figures,
   and it is not statistically anything either. The preview work on this screen
   already settled that a thin cohort shows NOTHING rather than a caveated
   number, and this is the live case it was written for.

   Separately, my own metrics are per service bucket and one of them has
   bookings_count 1. A cancellation rate of 0% from a single booking is not a
   rate. Buckets below a usable sample say so instead of presenting a
   percentage.
   ────────────────────────────────────────────────────────────────────────── */
const MIN_PEERS = 5;
const MIN_BOOKINGS = 5;

const BUCKET_LABEL: Record<string, string> = {
  airbnb: 'Airbnb turnover',
  deep: 'Deep clean',
  standard: 'Standard clean',
  moveout: 'Move in/out',
  post_construction: 'Post construction',
};

export function BenchmarksWiredPage() {
  const { organization } = useOrganization();

  const q = useQuery({
    queryKey: ['benchmarks-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;
      const { data, error } = await (supabase.rpc as any)('get_org_benchmarks', {
        p_org_id: organization.id,
        p_cohort: 'auto',
      });
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const phase = queryPhase(q);
  const d: any = q.data;

  const cohortSizes = useMemo(() => {
    if (!d?.peers) return { local: 0, regional: 0, national: 0 };
    return {
      local: (d.peers.local ?? []).length,
      regional: (d.peers.regional ?? []).length,
      national: (d.peers.national ?? []).length,
    };
  }, [d]);

  const best = useMemo(() => {
    const entries = Object.entries(cohortSizes) as [string, number][];
    return entries.sort((a, b) => b[1] - a[1])[0];
  }, [cohortSizes]);

  return (
    <AdminLayout title="Benchmarks" subtitle="Mobile layout, live data">
      <div className="portal-v2 mx-auto flex w-full max-w-[430px] flex-col gap-3.5 bg-[hsl(var(--pv-bg))] px-5 py-4">
        {phase === 'error' || phase === 'offline' ? (
          <Card>
            <CardTitle>Couldn&rsquo;t load benchmarks</CardTitle>
            <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
              Nothing is shown rather than shown wrong. Comparing yourself to a
              number that failed to arrive is worse than not comparing.
            </p>
          </Card>
        ) : phase === 'loading' ? (
          <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-3))]">Loading…</p>
        ) : !d ? (
          <Card>
            <CardTitle>Not available</CardTitle>
            <p className="mt-1.5 text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
              No benchmark data was returned for this organisation.
            </p>
          </Card>
        ) : (
          <>
            {/* The peer count decides whether ANY comparison is honest. */}
            {best[1] < MIN_PEERS ? (
              <Card>
                <CardTitle>Not enough businesses to compare against</CardTitle>
                <p className="mt-1.5 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
                  Your area has {cohortSizes.local}, your state has{' '}
                  {cohortSizes.regional}, and nationally there {cohortSizes.national === 1 ? 'is' : 'are'}{' '}
                  {cohortSizes.national}. A peer average needs enough businesses
                  that no single one can be worked out from it, so no comparison
                  figures are shown.
                </p>
                <p className="mt-2 text-[11.5px] font-semibold text-[hsl(var(--pv-ink-3))]">
                  Your own numbers are below and are unaffected.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <StatCard label="Cohort" value={String(best[1])} caption={`${best[0]} businesses`} />
                <StatCard label="Since" value={d.period_start ?? '—'} caption="90-day window" />
              </div>
            )}

            <Card>
              <CardTitle>Your numbers</CardTitle>
              <div className="mt-2.5 flex flex-col gap-3">
                {(d.my_metrics ?? []).map((mm: any) => {
                  const thin = (mm.bookings_count ?? 0) < MIN_BOOKINGS;
                  const pct = (v: number | null) =>
                    v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
                  return (
                    <div key={mm.service_bucket}>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12.5px] font-bold text-[hsl(var(--pv-ink))]">
                          {BUCKET_LABEL[mm.service_bucket] ?? mm.service_bucket}
                        </span>
                        <span className="ml-auto text-[11px] text-[hsl(var(--pv-ink-3))]">
                          {mm.bookings_count} booking{mm.bookings_count === 1 ? '' : 's'}
                        </span>
                      </div>
                      {thin ? (
                        /* A rate from one booking is not a rate. */
                        <p className="mt-1 text-[11.5px] font-semibold leading-[1.45] text-[hsl(var(--pv-ink-2))]">
                          Too few bookings to work out rates from — only the
                          average price is meaningful here:{' '}
                          {mm.avg_price === null ? '—' : `$${Number(mm.avg_price).toFixed(2)}`}.
                        </p>
                      ) : (
                        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                          {[
                            ['Avg price', mm.avg_price === null ? '—' : `$${Number(mm.avg_price).toFixed(2)}`],
                            ['Cancellations', pct(mm.cancel_rate)],
                            ['Repeat rate', pct(mm.repeat_rate)],
                            ['Recurring share', pct(mm.recurring_share)],
                            /* Null, not zero — no reviews have been left at
                               all, which is not a rating of nothing. */
                            ['Avg rating', mm.avg_rating === null ? 'No reviews yet' : String(mm.avg_rating)],
                            ['Review rate', mm.review_rate === null ? 'No reviews yet' : pct(mm.review_rate)],
                          ].map(([k, v]) => (
                            <div key={k as string} className="flex items-baseline gap-1.5">
                              <span className="text-[11px] text-[hsl(var(--pv-ink-3))]">{k as string}</span>
                              <span className="ml-auto tabular-nums text-[11.5px] font-bold text-[hsl(var(--pv-ink))]">
                                {v as string}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
