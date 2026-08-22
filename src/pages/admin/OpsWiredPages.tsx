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

/* ── Live tracking ─────────────────────────────────────────────────────── *
 * 6c is a hero (cleaners en route count + completed-today + two stat chips),
 * a Notifications card of five SMS toggles, the active-jobs list (or its
 * empty state), and a "today's completed routes" summary row. When a parent
 * (TrackingPage) supplies live data + handlers as props, those drive the
 * screen so there is exactly one source of truth for org SMS settings and
 * tracking rows. Standalone (/dashboard/tracking-v2, no props) it fetches
 * its own data so that route still works on its own. */
export interface TrackingSmsSettingsLite {
  notify_admin_on_the_way: boolean;
  notify_client_on_the_way: boolean;
  notify_client_distance_eta: boolean;
  notify_client_arrived: boolean;
  notify_admin_arrived: boolean;
}

export interface TrackingActiveJobLite {
  id: string;
  staffName: string;
  bookingNumber?: number | null;
}

export interface TrackingHistoricalJobLite {
  id: string;
}

const DEFAULT_SMS_SETTINGS: TrackingSmsSettingsLite = {
  notify_admin_on_the_way: true,
  notify_client_on_the_way: true,
  notify_client_distance_eta: true,
  notify_client_arrived: true,
  notify_admin_arrived: true,
};

function TrackingToggleRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex-1 text-[12.5px] font-bold text-[hsl(var(--pv-ink))]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
          checked ? 'bg-[hsl(var(--pv-brand))]' : 'bg-[hsl(var(--pv-border))]'
        }`}
      >
        <span
          className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-transform ${
            checked ? 'translate-x-[19px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </div>
  );
}

export function TrackingMobileBody({
  activeJobs: activeJobsProp,
  historicalJobs: historicalJobsProp,
  loading: loadingProp,
  smsSettings: smsSettingsProp,
  savingToggle: savingToggleProp,
  onToggle,
  onBack,
}: {
  activeJobs?: TrackingActiveJobLite[];
  historicalJobs?: TrackingHistoricalJobLite[];
  loading?: boolean;
  smsSettings?: TrackingSmsSettingsLite;
  savingToggle?: boolean;
  onToggle?: (field: keyof TrackingSmsSettingsLite, value: boolean) => void;
  onBack?: () => void;
} = {}) {
  const { organization } = useOrganization();
  const standalone = activeJobsProp === undefined;

  /* Standalone fallback data (only used when no props are supplied). */
  const [standaloneSettings, setStandaloneSettings] = useState<TrackingSmsSettingsLite>(DEFAULT_SMS_SETTINGS);
  const [standaloneSaving, setStandaloneSaving] = useState(false);

  const q = useQuery({
    queryKey: ['tracking-v2', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('cleaner_location_tracking')
        .select(`
          id, is_active,
          booking:bookings(booking_number),
          staff:staff(name)
        `)
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('id', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: standalone && !!organization?.id,
    staleTime: 15 * 1000,
    refetchInterval: standalone ? 30 * 1000 : false,
  });

  useEffect(() => {
    if (!standalone || !organization?.id) return;
    supabase
      .from('organization_sms_settings')
      .select('notify_admin_on_the_way, notify_client_on_the_way, notify_client_distance_eta, notify_admin_arrived, notify_client_arrived')
      .eq('organization_id', organization.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setStandaloneSettings({
            notify_admin_on_the_way: data.notify_admin_on_the_way ?? true,
            notify_client_on_the_way: data.notify_client_on_the_way ?? true,
            notify_client_distance_eta: (data as any).notify_client_distance_eta ?? true,
            notify_admin_arrived: (data as any).notify_admin_arrived ?? true,
            notify_client_arrived: (data as any).notify_client_arrived ?? true,
          });
        }
      });
  }, [standalone, organization?.id]);

  const handleStandaloneToggle = async (field: keyof TrackingSmsSettingsLite, value: boolean) => {
    if (!organization?.id) return;
    setStandaloneSaving(true);
    setStandaloneSettings((prev) => ({ ...prev, [field]: value }));
    const { error } = await supabase
      .from('organization_sms_settings')
      .update({ [field]: value } as any)
      .eq('organization_id', organization.id);
    if (error) setStandaloneSettings((prev) => ({ ...prev, [field]: !value }));
    setStandaloneSaving(false);
  };

  const activeJobs: TrackingActiveJobLite[] = standalone
    ? (q.data ?? []).map((t: any) => ({
        id: t.id,
        staffName: t.staff?.name ?? 'Unknown cleaner',
        bookingNumber: t.booking?.booking_number ?? null,
      }))
    : (activeJobsProp ?? []);

  const historicalJobs = standalone ? [] : (historicalJobsProp ?? []);
  const loading = standalone ? q.isLoading : !!loadingProp;
  const smsSettings = standalone ? standaloneSettings : (smsSettingsProp ?? DEFAULT_SMS_SETTINGS);
  const savingToggle = standalone ? standaloneSaving : !!savingToggleProp;
  const handleToggle = standalone ? handleStandaloneToggle : (onToggle ?? (() => {}));

  const alertsOnCount = Object.values(smsSettings).filter(Boolean).length;

  return (
    <div className="portal-v2 mx-auto flex w-full max-w-[430px] flex-col bg-[hsl(var(--pv-bg))]">
      <div className="rounded-b-[26px] bg-[hsl(var(--pv-brand-strong,var(--pv-brand)))] px-5 pb-[22px] pt-3.5 text-white">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Go back"
            onClick={onBack}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-white/10"
          >
            ←
          </button>
          <div className="flex-1">
            <div className="text-[11px] font-semibold opacity-65">Tracking</div>
            <div className="whitespace-nowrap text-[16px] font-extrabold">Live Tracking</div>
          </div>
        </div>
        <div className="mt-[18px]">
          <div className="text-[11.5px] font-semibold opacity-65">Cleaners en route</div>
          <div className="flex items-baseline gap-2.5">
            <div className="text-[32px] font-extrabold">{loading ? '—' : activeJobs.length}</div>
            <div className="text-[12px] opacity-60">
              {loading ? '—' : historicalJobs.length} completed route{historicalJobs.length === 1 ? '' : 's'} today
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <div className="flex-1 rounded-xl bg-white/10 px-3 py-2.5">
            <div className="text-[17px] font-extrabold">{alertsOnCount}</div>
            <div className="text-[10px] font-semibold opacity-65">alerts on</div>
          </div>
          <div className="flex-1 rounded-xl bg-white/10 px-3 py-2.5">
            <div className="text-[17px] font-extrabold">ETA</div>
            <div className="text-[10px] font-semibold opacity-65">in client SMS</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 px-5 py-4">
        <div className="flex flex-col gap-2.5 rounded-2xl border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] p-4">
          <div className="text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">Notifications</div>
          <TrackingToggleRow
            label="Notify admin — cleaner on my way"
            checked={smsSettings.notify_admin_on_the_way}
            disabled={savingToggle}
            onChange={(v) => handleToggle('notify_admin_on_the_way', v)}
          />
          <TrackingToggleRow
            label="Notify client — cleaner on my way"
            checked={smsSettings.notify_client_on_the_way}
            disabled={savingToggle}
            onChange={(v) => handleToggle('notify_client_on_the_way', v)}
          />
          <TrackingToggleRow
            label="Include distance & ETA in client SMS"
            checked={smsSettings.notify_client_distance_eta}
            disabled={savingToggle}
            onChange={(v) => handleToggle('notify_client_distance_eta', v)}
          />
          <TrackingToggleRow
            label="Notify client — cleaner arrived"
            checked={smsSettings.notify_client_arrived}
            disabled={savingToggle}
            onChange={(v) => handleToggle('notify_client_arrived', v)}
          />
          <TrackingToggleRow
            label="Notify admin — cleaner arrived"
            checked={smsSettings.notify_admin_arrived}
            disabled={savingToggle}
            onChange={(v) => handleToggle('notify_admin_arrived', v)}
          />
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] p-7 text-center text-[12.5px] font-semibold text-[hsl(var(--pv-ink-3))]">
            Loading…
          </div>
        ) : activeJobs.length === 0 ? (
          <div className="rounded-2xl border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-4.5 py-7 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--pv-bg))] text-[22px]">
              🚗
            </div>
            <div className="mt-3 text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">
              No cleaners currently en route
            </div>
            <div className="mx-auto mt-1 max-w-[270px] text-[11.5px] leading-[1.55] text-[hsl(var(--pv-ink-3))]">
              Active tracking appears here when a cleaner presses "On My Way".
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {activeJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-4.5 py-3.5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--pv-brand))]/10 text-[13px] font-bold text-[hsl(var(--pv-brand))]">
                  {job.staffName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold text-[hsl(var(--pv-ink))]">{job.staffName}</div>
                  <div className="text-[11px] text-[hsl(var(--pv-ink-3))]">
                    {job.bookingNumber ? `#${job.bookingNumber}` : 'No booking linked'}
                  </div>
                </div>
                <span className="rounded-full bg-[hsl(var(--pv-success))]/15 px-2.5 py-1 text-[10px] font-bold text-[hsl(var(--pv-success))]">
                  En Route
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center rounded-2xl border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-4.5 py-3.5">
          <div className="text-[13px] font-extrabold text-[hsl(var(--pv-ink))]">Today's completed routes</div>
          <div className="ml-auto text-[11.5px] text-[hsl(var(--pv-ink-3))]">
            {loading ? '—' : historicalJobs.length === 0 ? 'None yet' : historicalJobs.length}
          </div>
        </div>
      </div>
    </div>
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
