import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { queryPhase } from '@/lib/queryState';
import { SimpleListView, useSimpleSearch, InverseHeader, StatWell, SegmentedTabs, MediaGrid, Lightbox, type SimpleListRow, type MediaItem } from '@/components/portal-v2';
import type { ActionChip } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * Expenses, booking media and live tracking, wired. All ADDITIVE.
 *
 * Batched because all three share the same situation: ZERO rows on the live
 * org. expenses 0, booking_photos 0, cleaner_location_tracking 0.
 *
 * So for all three the READY state is unverifiable here and only empty,
 * loading and error can be checked — the same honest limit as messages. The
 * empty states below are the org's true state, not a contrivance.
 *
 * ── Both tables have a NULLABLE organization_id ───────────────────────────
 *
 * expenses.organization_id and booking_photos.organization_id are both
 * `string | null` in the generated schema. A row with a null org is invisible
 * to every org-scoped query — including these — so it is not merely
 * unattributed, it is unreachable. Nothing is orphaned today (both tables are
 * empty), but a screen that filters on organization_id can never show such a
 * row and will never say why. Recorded rather than worked around: filtering is
 * correct, and the fix belongs in whatever writes a null.
 */

const EXPENSE_CATEGORY: Record<string, string> = {
  equipment: 'Equipment',
  insurance: 'Insurance',
  marketing: 'Marketing',
  mileage: 'Mileage',
  office: 'Office',
  dialers: 'Dialers',
  domain: 'Domain',
  misc: 'Miscellaneous',
  other: 'Other',
};

const PHOTO_TYPE: Record<string, string> = {
  before: 'Before',
  after: 'After',
  inspection: 'Inspection',
};

const money = (n: unknown) =>
  n === null || n === undefined ? undefined : `$${Number(n).toFixed(2)}`;

/* ── Expenses ──────────────────────────────────────────────────────────── */
export function ExpensesMobileBody({
  actions,
}: {
  actions?: ActionChip[];
} = {}) {
  const { organization } = useOrganization();
  const orgTz = useOrgTimezone();
  const [search, setSearch] = useState('');

  const q = useQuery({
    queryKey: ['expenses-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('expenses')
        .select('id, amount, category, description, vendor, expense_date, receipt_url')
        .eq('organization_id', organization.id)
        .order('expense_date', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const fmt = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: orgTz || 'UTC',
    });
    /* expense_date is a DATE column, so it is anchored at midday UTC before
       formatting — otherwise it shifts a day for anyone west of the org. */
    return (d: string) => f.format(new Date(`${d}T12:00:00Z`));
  }, [orgTz]);

  const phase = queryPhase(q);
  const rows: SimpleListRow[] = useMemo(
    () =>
      (q.data ?? []).map((e: any) => ({
        id: e.id,
        title: e.description || EXPENSE_CATEGORY[e.category] || e.category,
        meta: e.vendor ? e.vendor : 'No vendor recorded',
        lines: [
          EXPENSE_CATEGORY[e.category] ?? e.category,
          e.expense_date ? fmt(e.expense_date) : 'No date',
          /* A receipt is what makes it deductible, so its absence is worth
             stating rather than leaving to be noticed at tax time. */
          e.receipt_url ? 'Receipt attached' : 'No receipt',
        ],
        money: money(e.amount),
      })),
    [q.data, fmt],
  );

  const filtered = useSimpleSearch(rows, search);
  const total = useMemo(
    () => (q.data ?? []).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0),
    [q.data],
  );

  const listState: ListState =
    phase === 'error' || phase === 'offline' ? 'error'
      : phase === 'loading' ? 'loading'
      : filtered.length === 0 ? 'empty' : 'ready';

  return (
    <>
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <SimpleListView
          actions={actions}
          header={
            <InverseHeader
              eyebrow="Costs"
              business="Expenses"
              revenueLabel="Logged this period"
              revenue={phase === 'ready' ? money(total) ?? '$0.00' : '—'}
              error={phase !== 'ready'}
              onRetry={() => q.refetch()}
              wells={
                <>
                  <StatWell value={phase === 'ready' ? String(rows.length) : '—'} caption="entries" />
                  {/* A receipt is what makes a cost deductible, so the count
                      without one is the figure worth surfacing. */}
                  <StatWell
                    value={phase === 'ready' ? String((q.data ?? []).filter((e: any) => !e.receipt_url).length) : '—'}
                    caption="no receipt"
                  />
                </>
              }
            />
          }
          title="Expenses"
          phase={listState}
          rows={filtered}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by description or vendor..."
          emptyTitle="No expenses logged"
          emptyHint="Costs you record will show here and feed your P&L."
          errorLabel="Couldn't load expenses"
          addLabel="Add expense"
          onRetry={() => q.refetch()}
          sectionLabel={
            search.trim()
              ? `${filtered.length} of ${rows.length}`
              : rows.length === 0
                ? 'nothing logged'
                : `${rows.length} · ${money(total)} total`
          }
        />
      </div>
    </>
  );
}

/* ── Booking media ─────────────────────────────────────────────────────── *
 * 6f is a photo grid, not a list: two-column tiles carrying the before/after
 * badge, a hero with the upload counts, a type filter and search, and
 * "Load more" underneath. MediaGrid/MediaTile/Lightbox are the shared
 * primitives the three portal-v2 media screens already use for exactly this
 * shape, so this reuses them instead of the generic SimpleListView, which
 * has no way to show an image at all. */
const PHOTO_PAGE_SIZE = 8;

export function BookingPhotosMobileBody() {
  const { organization } = useOrganization();
  const orgTz = useOrgTimezone();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'before' | 'after' | 'inspection'>('all');
  const [visible, setVisible] = useState(PHOTO_PAGE_SIZE);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ['photos-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('booking_photos')
        .select(`
          id, photo_url, photo_type, media_type, caption, issue_category, created_at,
          booking:bookings(booking_number, customer:customers(first_name, last_name)),
          staff:staff(name)
        `)
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
  });

  const fmt = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', timeZone: orgTz || 'UTC',
    });
    return (iso: string) => f.format(new Date(iso));
  }, [orgTz]);

  const phase = queryPhase(q);
  const all = (q.data ?? []) as any[];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((p) => {
      if (typeFilter !== 'all' && p.photo_type !== typeFilter) return false;
      if (!term) return true;
      const customer = p.booking?.customer
        ? `${p.booking.customer.first_name} ${p.booking.customer.last_name}`.toLowerCase()
        : '';
      const staffName = p.staff?.name?.toLowerCase() ?? '';
      const bookingNum = p.booking?.booking_number ? String(p.booking.booking_number) : '';
      return customer.includes(term) || staffName.includes(term) || bookingNum.includes(term);
    });
  }, [all, search, typeFilter]);

  const isVideo = (p: any) => {
    if (p.media_type === 'video') return true;
    const url = String(p.photo_url ?? '').toLowerCase();
    return url.endsWith('.mp4') || url.endsWith('.mov') || url.endsWith('.m4v');
  };

  const videoCount = all.filter(isVideo).length;
  const beforeCount = all.filter((p) => p.photo_type === 'before').length;
  const afterCount = all.filter((p) => p.photo_type === 'after').length;

  const shown = filtered.slice(0, visible);

  // Storage is a private bucket — the grid needs a signed URL per photo, not
  // the bare stored path. Resolve only what is on screen, and only once.
  useEffect(() => {
    const missing = shown.filter((p) => !isVideo(p) && !signedUrls[p.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (p) => {
          const { data } = await supabase.storage.from('booking-photos').createSignedUrl(p.photo_url, 3600);
          return [p.id, data?.signedUrl ?? ''] as const;
        }),
      );
      if (cancelled) return;
      setSignedUrls((prev) => {
        const next = { ...prev };
        for (const [id, url] of entries) if (url) next[id] = url;
        return next;
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((p) => p.id).join(',')]);

  const items: MediaItem[] = shown.map((p) => ({
    id: p.id,
    src: signedUrls[p.id] ?? '',
    alt: p.photo_type ? `${PHOTO_TYPE[p.photo_type] ?? p.photo_type} photo` : 'Booking photo',
    badge: p.photo_type ? (PHOTO_TYPE[p.photo_type] ?? p.photo_type) : undefined,
    caption: [
      p.staff?.name ?? 'Unknown cleaner',
      [p.booking?.customer ? `${p.booking.customer.first_name} ${p.booking.customer.last_name}` : null, p.created_at ? fmt(p.created_at) : null]
        .filter(Boolean)
        .join(' · '),
    ].join(' — '),
  }));

  const gridState: 'ready' | 'loading' | 'empty' | 'error' =
    phase === 'error' || phase === 'offline' ? 'error'
      : phase === 'loading' ? 'loading'
      : filtered.length === 0 ? 'empty' : 'ready';

  return (
    <>
      <div className="portal-v2 mx-auto flex w-full max-w-[430px] flex-col gap-3.5 bg-[hsl(var(--pv-bg))] px-4 pb-6 pt-3">
        <InverseHeader
          eyebrow="Booking photos"
          business="Booking Media"
          revenueLabel="Uploads from cleaners"
          revenue={phase === 'ready' ? String(all.length) : '—'}
          error={phase !== 'ready'}
          onRetry={() => q.refetch()}
          wells={
            <>
              <StatWell value={phase === 'ready' ? String(beforeCount) : '—'} caption="before" />
              <StatWell value={phase === 'ready' ? String(afterCount) : '—'} caption="after" />
              <StatWell value={phase === 'ready' ? String(videoCount) : '—'} caption="videos" />
            </>
          }
        />

        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setVisible(PHOTO_PAGE_SIZE); }}
          placeholder="Search customer, cleaner, booking #…"
          className="h-11 w-full rounded-[11px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-3.5 text-[13px] font-medium text-[hsl(var(--pv-ink))] placeholder:text-[hsl(var(--pv-ink-3))]"
        />

        <SegmentedTabs
          label="Filter by type"
          value={typeFilter}
          onChange={(v) => { setTypeFilter(v); setVisible(PHOTO_PAGE_SIZE); }}
          tabs={[
            { id: 'all', label: 'All types' },
            { id: 'before', label: 'Before' },
            { id: 'after', label: 'After' },
            { id: 'inspection', label: 'Inspection' },
          ]}
        />

        <MediaGrid
          items={items}
          state={gridState}
          emptyTitle="No photos or video yet"
          emptyHint="Before and after uploads from cleaners will show here."
          errorLabel="Couldn't load booking media"
          onRetry={() => q.refetch()}
          onOpen={(i) => setLightboxIndex(i)}
          actions={
            filtered.length > shown.length ? (
              <button
                type="button"
                onClick={() => setVisible((v) => v + PHOTO_PAGE_SIZE)}
                className="w-full rounded-[11px] border-[1.5px] border-[hsl(var(--pv-brand))] py-2.5 text-[12.5px] font-extrabold text-[hsl(var(--pv-brand))]"
              >
                Load more
              </button>
            ) : undefined
          }
        />
      </div>

      <Lightbox
        open={lightboxIndex !== null}
        items={items.map((it) => ({ src: it.src, alt: it.alt, caption: it.caption, badge: it.badge }))}
        index={lightboxIndex ?? 0}
        onIndex={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
}

/* ── Live tracking ─────────────────────────────────────────────────────── */
export function TrackingMobileBody({
  actions,
  onFilter,
  filterCount,
}: {
  actions?: ActionChip[];
  onFilter?: () => void;
  filterCount?: number;
} = {}) {
  const { organization } = useOrganization();
  const orgTz = useOrgTimezone();
  const [search, setSearch] = useState('');

  const q = useQuery({
    queryKey: ['tracking-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('cleaner_location_tracking')
        .select(`
          id, latitude, longitude, recorded_at, arrived_at, is_active,
          booking:bookings(booking_number, scheduled_at),
          staff:staff(name)
        `)
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('recorded_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organization?.id,
    /* A live position is worthless stale. Short staleTime rather than the
       app default of 5 minutes. */
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });

  const fmtTime = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: orgTz || 'UTC',
    });
    return (iso: string) => f.format(new Date(iso));
  }, [orgTz]);

  const phase = queryPhase(q);
  const rows: SimpleListRow[] = useMemo(
    () =>
      (q.data ?? []).map((t: any) => {
        /* One row per booking, UPDATED in place — there is no position
           history, so "last seen" is all this data can honestly support.
           A trail would need a points table; see the tracking write-up. */
        const age = t.recorded_at
          ? Math.round((Date.now() - new Date(t.recorded_at).getTime()) / 60000)
          : null;
        return {
          id: t.id,
          title: t.staff?.name ?? 'Unknown cleaner',
          meta: t.booking?.booking_number ? `#${t.booking.booking_number}` : 'No booking linked',
          lines: [
            t.arrived_at ? `Arrived ${fmtTime(t.arrived_at)}` : 'En route',
            t.recorded_at ? `Last seen ${fmtTime(t.recorded_at)}` : 'Never reported a position',
            /* A position from an hour ago is not a live position, and a map
               pin does not say how old it is. */
            age !== null && age > 10
              ? `Position is ${age} minutes old — may not be current`
              : null,
          ],
          badges:
            age !== null && age > 10
              ? [{ tone: 'warn' as const, label: 'Stale' }]
              : [{ tone: 'success' as const, label: 'Live' }],
        };
      }),
    [q.data, fmtTime],
  );

  const filtered = useSimpleSearch(rows, search);
  const listState: ListState =
    phase === 'error' || phase === 'offline' ? 'error'
      : phase === 'loading' ? 'loading'
      : filtered.length === 0 ? 'empty' : 'ready';

  return (
    <>
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <SimpleListView
          actions={actions}
          onFilter={onFilter}
          filterCount={filterCount}
          header={
            <InverseHeader
              eyebrow="Live"
              business="Tracking"
              revenueLabel="Cleaners on the road"
              revenue={phase === 'ready' ? String(rows.length) : '—'}
              error={phase !== 'ready'}
              onRetry={() => q.refetch()}
              wells={
                <>
                  <StatWell
                    value={phase === 'ready' ? String((q.data ?? []).filter((t: any) => t.arrived_at).length) : '—'}
                    caption="arrived"
                  />
                  {/* Stale positions are the hazard on this screen, so the
                      count is in the hero rather than only on the rows. */}
                  <StatWell
                    value={
                      phase === 'ready'
                        ? String((q.data ?? []).filter((t: any) => t.recorded_at && (Date.now() - new Date(t.recorded_at).getTime()) / 60000 > 10).length)
                        : '—'
                    }
                    caption="stale"
                  />
                </>
              }
            />
          }
          title="Tracking"
          phase={listState}
          rows={filtered}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by cleaner or booking..."
          emptyTitle="Nobody is being tracked"
          emptyHint="Cleaners who start a job with location sharing on will show here."
          errorLabel="Couldn't load tracking"
          addLabel="Refresh"
          onRetry={() => q.refetch()}
          sectionLabel={
            rows.length === 0 ? 'nobody on the road' : `${rows.length} cleaner${rows.length === 1 ? '' : 's'} tracking`
          }
        />
      </div>
    </>
  );
}

/* ── Layout-free bodies ───────────────────────────────────────────────────
   Each screen is exported twice.

   *MobileBody renders the screen and NOTHING around it — no AdminLayout, no
   page chrome. That is what an existing admin page drops into its mobile
   branch, without nesting AdminLayout inside AdminLayout and getting two
   headers and two sidebars.

   The default/named *WiredPage export keeps the layout and is what the
   /dashboard/*-v2 route renders, so those routes are unchanged.
   ──────────────────────────────────────────────────────────────────────── */


export function ExpensesWiredPage() {
  return (
    <AdminLayout title="Expenses" subtitle="Mobile layout, live data">
      <ExpensesMobileBody />
    </AdminLayout>
  );
}

export function BookingPhotosWiredPage() {
  return (
    <AdminLayout title="Booking media" subtitle="Mobile layout, live data">
      <BookingPhotosMobileBody />
    </AdminLayout>
  );
}

export function TrackingWiredPage() {
  return (
    <AdminLayout title="Tracking" subtitle="Mobile layout, live data">
      <TrackingMobileBody />
    </AdminLayout>
  );
}
