import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import type { ActionChip } from '@/components/portal-v2';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { queryPhase } from '@/lib/queryState';
import { customerDisplayName } from '@/lib/customerStatus';
import { Card, CardTitle, StatCard, SimpleListView, InverseHeader, StatWell, type SimpleListRow } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/* ── Scheduler: month/week + day agenda + booking detail ───────────────────
   6a is a month grid with a day agenda below it; 6b is the week strip plus
   a full booking-detail card with working actions. Both live behind the
   Month/Week segmented tabs on this one screen, sharing the same day agenda
   and the same detail sheet.

   Days are computed in the ORG's timezone. A booking at 8am in Florida must
   not fall on the previous day for someone looking from California, and
   `new Date(iso).toDateString()` on the device does exactly that — which is
   what the repo's local/no-device-local-dates rule exists to stop.
   ────────────────────────────────────────────────────────────────────────── */
import { AddBookingDialog } from '@/components/admin/AddBookingDialog';
import { useBookings, useDeleteBooking, type BookingWithDetails } from '@/hooks/useBookings';
import { SegmentedTabs, CalendarMonth, isoParts } from '@/components/portal-v2';
import { formatFullAddress } from '@/lib/formatAddress';
import { orgAddDays, orgDayOfWeek } from '@/lib/orgDateRange';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const STATUS_TONE: Record<string, 'brand' | 'success' | 'ai' | 'orange'> = {
  pending: 'orange',
  confirmed: 'brand',
  in_progress: 'ai',
  completed: 'success',
  rescheduled: 'ai',
  no_show: 'orange',
};

const STATUS_BADGE: Record<string, { tone: 'success' | 'info' | 'warn' | 'danger'; label: string }> = {
  pending: { tone: 'warn', label: 'Pending' },
  confirmed: { tone: 'info', label: 'Confirmed' },
  in_progress: { tone: 'info', label: 'In progress' },
  completed: { tone: 'success', label: 'Completed' },
  rescheduled: { tone: 'warn', label: 'Rescheduled' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
  no_show: { tone: 'danger', label: 'No-show' },
};

export function SchedulerMobileBody({
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

  const dayKey = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: orgTz || 'UTC',
    });
    return (d: Date) => f.format(d);
  }, [orgTz]);

  const today = useMemo(() => dayKey(new Date()), [dayKey]);
  const [selected, setSelected] = useState<string>(today);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [detailBooking, setDetailBooking] = useState<any | null>(null);
  const [editingBooking, setEditingBooking] = useState<BookingWithDetails | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [sendingClient, setSendingClient] = useState(false);
  const [sendingCleaner, setSendingCleaner] = useState(false);

  const q = useBookings();
  const deleteBooking = useDeleteBooking();

  const phase = queryPhase(q);

  const liveBookings = useMemo(
    () => ((q.data ?? []) as BookingWithDetails[]).filter(b => b.status !== 'cancelled'),
    [q.data],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, BookingWithDetails[]>();
    for (const b of liveBookings) {
      const k = dayKey(new Date(b.scheduled_at));
      const list = m.get(k) ?? [];
      list.push(b);
      m.set(k, list);
    }
    return m;
  }, [liveBookings, dayKey]);

  const daysWithWork = useMemo(() => [...byDay.keys()].sort(), [byDay]);

  /* Month figure for the hero — the whole point of 6a's "Bookings this
     month" line. Computed from the selected day's own calendar month, in
     the org's timezone, so switching months in the grid updates it too. */
  const monthPrefix = selected.slice(0, 7);
  const monthBookings = useMemo(
    () => liveBookings.filter(b => dayKey(new Date(b.scheduled_at)).startsWith(monthPrefix)),
    [liveBookings, dayKey, monthPrefix],
  );
  const weekStartOf = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const dow = orgDayOfWeek(new Date(`${iso}T12:00:00Z`), 'UTC');
    return orgAddDays(new Date(`${iso}T12:00:00Z`), -dow, 'UTC');
  };
  const thisWeekKeys = useMemo(() => {
    const start = weekStartOf(today);
    return Array.from({ length: 7 }, (_, i) => dayKey(orgAddDays(start, i, 'UTC')));
  }, [today, dayKey]);
  const thisWeekCount = useMemo(
    () => liveBookings.filter(b => thisWeekKeys.includes(dayKey(new Date(b.scheduled_at)))).length,
    [liveBookings, thisWeekKeys, dayKey],
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

  const events = useMemo(() => {
    const m: Record<string, Array<'brand' | 'success' | 'ai' | 'orange'>> = {};
    for (const [k, list] of byDay) {
      const tones = new Set(list.map(b => STATUS_TONE[b.status] ?? 'brand'));
      m[k] = [...tones];
    }
    return m;
  }, [byDay]);

  const weekDays = useMemo(() => {
    const start = weekStartOf(selected);
    return Array.from({ length: 7 }, (_, i) => dayKey(orgAddDays(start, i, 'UTC')));
  }, [selected, dayKey]);

  const rows: SimpleListRow[] = todays.map((b) => ({
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

  const sendClientNotification = async (booking: BookingWithDetails) => {
    if (!booking.customer?.phone) { toast.error('No customer phone number found'); return; }
    setSendingClient(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-booking-reminder', {
        body: {
          bookingId: booking.id,
          customerPhone: booking.customer.phone,
          customerName: customerDisplayName(booking.customer?.first_name, booking.customer?.last_name) ?? 'there',
          serviceName: booking.service?.name || 'Cleaning Service',
          scheduledAt: booking.scheduled_at,
          address: booking.address || '',
          totalAmount: booking.total_amount,
          organizationId: organization?.id,
        },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error);
      toast.success(`Reminder sent to ${booking.customer.first_name}`);
    } catch (err: any) {
      toast.error('Failed to notify client: ' + (err.message || 'Unknown error'));
    } finally {
      setSendingClient(false);
    }
  };

  const sendCleanerNotification = async (booking: BookingWithDetails) => {
    if (!booking.staff?.phone) { toast.error('No cleaner assigned or no phone on file'); return; }
    setSendingCleaner(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-cleaner-notification', {
        body: {
          cleanerName: booking.staff.name,
          cleanerPhone: booking.staff.phone,
          customerName: customerDisplayName(booking.customer?.first_name, booking.customer?.last_name) ?? 'Unknown Customer',
          customerPhone: booking.customer?.phone || 'Not provided',
          serviceName: booking.service?.name || (booking.total_amount === 0 ? 'Re-clean' : 'Cleaning Service'),
          appointmentDate: new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: orgTz || 'UTC' }).format(new Date(booking.scheduled_at)),
          appointmentTime: fmtTime(booking.scheduled_at),
          address: formatFullAddress(booking, booking.customer) || 'Address not provided',
          bookingNumber: booking.booking_number,
          organizationId: organization?.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`SMS sent to ${booking.staff.name}`);
    } catch (err: any) {
      toast.error('Failed to send notification: ' + (err.message || 'Unknown error'));
    } finally {
      setSendingCleaner(false);
    }
  };

  const badge = detailBooking ? STATUS_BADGE[detailBooking.status] : null;

  return (
    <>
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        {phase === 'ready' && (
          <div className="px-4 pt-3">
            <SegmentedTabs
              label="Calendar view"
              value={viewMode}
              onChange={(id) => setViewMode(id as 'month' | 'week')}
              tabs={[
                { id: 'month', label: 'Month' },
                { id: 'week', label: 'Week' },
              ]}
            />

            {viewMode === 'month' ? (
              <CalendarMonth
                label="Scheduler calendar"
                variant="scheduler"
                value={selected}
                today={today}
                onChange={setSelected}
                events={events}
              />
            ) : (
              <div className="mt-3 flex gap-1">
                {weekDays.map(k => {
                  const p = isoParts(k);
                  const on = k === selected;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSelected(k)}
                      className={
                        'flex flex-1 flex-col items-center gap-0.5 rounded-[10px] py-2 ' +
                        (on
                          ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                          : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink))]')
                      }
                    >
                      <span className={'text-[9.5px] font-bold ' + (on ? 'opacity-75' : 'text-[hsl(var(--pv-ink-3))]')}>
                        {p.weekday.slice(0, 3).toUpperCase()}
                      </span>
                      <span className="text-[14px] font-extrabold tabular-nums">{p.day}</span>
                      {!on && (byDay.get(k)?.length ?? 0) > 0 && (
                        <span className="h-[4px] w-[4px] rounded-full bg-[hsl(var(--pv-brand))]" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {daysWithWork.length === 0 && (
              <p className="py-2 text-[11.5px] font-semibold text-[hsl(var(--pv-ink-3))]">
                No bookings on any day.
              </p>
            )}
          </div>
        )}

        <SimpleListView
          actions={actions}
          onFilter={onFilter}
          filterCount={filterCount}
          onSelect={(r) => {
            const b = todays.find(bb => bb.id === r.id);
            if (b) setDetailBooking(b);
          }}
          onAdd={() => setAddOpen(true)}
          header={
            <InverseHeader
              eyebrow="Schedule"
              business="Scheduler"
              revenueLabel="Bookings this month"
              revenue={phase === 'ready' ? String(monthBookings.length) : '—'}
              error={phase !== 'ready'}
              onRetry={() => q.refetch()}
              wells={
                <>
                  <StatWell
                    value={phase === 'ready' ? String(thisWeekCount) : '—'}
                    caption="this week"
                  />
                  <StatWell
                    value={phase === 'ready' ? String(todays.filter((b) => !b.staff?.name).length) : '—'}
                    caption="unassigned today"
                  />
                </>
              }
            />
          }
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

      {/* 6b: booking detail sheet, with every action wired to a real mutation
          or a real message send — not just rendered. */}
      <Sheet open={!!detailBooking} onOpenChange={(open) => { if (!open) setDetailBooking(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe max-h-[85dvh] overflow-y-auto">
          {detailBooking && (
            <div className="portal-v2 flex flex-col gap-3.5 pt-2">
              <div className="flex items-center">
                <div>
                  <div className="text-[15px] font-extrabold text-[hsl(var(--pv-ink))]">
                    {detailBooking.service?.name ?? 'Booking'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[hsl(var(--pv-ink-3))]">
                    Booking #{detailBooking.booking_number}
                  </div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[17px] font-extrabold text-[hsl(var(--pv-ink))]">
                    {detailBooking.total_amount === null ? '—' : `$${Number(detailBooking.total_amount).toFixed(2)}`}
                  </div>
                  {badge && (
                    <span
                      className={
                        'mt-1 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ' +
                        (badge.tone === 'success'
                          ? 'bg-[hsl(var(--pv-success-soft))] text-[hsl(var(--pv-success))]'
                          : badge.tone === 'danger'
                            ? 'bg-[hsl(var(--pv-danger-soft))] text-[hsl(var(--pv-danger))]'
                            : badge.tone === 'warn'
                              ? 'bg-[hsl(var(--pv-warn-soft))] text-[hsl(var(--pv-warn))]'
                              : 'bg-[hsl(var(--pv-info-soft))] text-[hsl(var(--pv-info))]')
                      }
                    >
                      {badge.label}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 text-center text-[13px]" aria-hidden>👤</span>
                  <div className="flex-1">
                    <div className="text-[12.5px] font-bold text-[hsl(var(--pv-ink))]">
                      {customerDisplayName(detailBooking.customer?.first_name, detailBooking.customer?.last_name) ?? 'Unknown customer'}
                    </div>
                    {detailBooking.customer?.email && (
                      <div className="text-[11px] text-[hsl(var(--pv-ink-3))]">{detailBooking.customer.email}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-6 text-center text-[13px]" aria-hidden>🕘</span>
                  <span className="text-[12.5px] font-bold text-[hsl(var(--pv-ink))]">
                    {fmtDayLabel(dayKey(new Date(detailBooking.scheduled_at)))} · {fmtTime(detailBooking.scheduled_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-6 text-center text-[13px]" aria-hidden>📍</span>
                  <span className="text-[12.5px] font-bold text-[hsl(var(--pv-ink))]">
                    {formatFullAddress(detailBooking, detailBooking.customer) || 'No address on file'}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-6 text-center text-[13px]" aria-hidden>👥</span>
                  <span className="text-[12.5px] font-bold text-[hsl(var(--pv-ink))]">
                    {detailBooking.staff?.name ?? 'Unassigned'}{' '}
                    <span className="font-semibold text-[hsl(var(--pv-ink-3))]">· assigned staff</span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setEditingBooking(detailBooking); setDetailBooking(null); }}
                  className="rounded-[10px] bg-[hsl(var(--pv-brand))] py-2.5 text-[12px] font-extrabold text-[hsl(var(--pv-brand-ink))]"
                >
                  ✎ Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const dup = { ...detailBooking, id: '' as any, booking_number: 0 };
                    setDetailBooking(null);
                    setEditingBooking(dup);
                  }}
                  className="rounded-[10px] border border-[hsl(var(--pv-border))] py-2.5 text-[12px] font-bold text-[hsl(var(--pv-ink))]"
                >
                  ⧉ Duplicate
                </button>
                <button
                  type="button"
                  disabled={sendingClient}
                  onClick={() => sendClientNotification(detailBooking)}
                  className="rounded-[10px] border border-[hsl(var(--pv-border))] py-2.5 text-[12px] font-bold text-[hsl(var(--pv-ink))] disabled:opacity-60"
                >
                  🔔 {sendingClient ? 'Sending…' : 'Notify client'}
                </button>
                <button
                  type="button"
                  disabled={sendingCleaner}
                  onClick={() => sendCleanerNotification(detailBooking)}
                  className="rounded-[10px] border border-[hsl(var(--pv-border))] py-2.5 text-[12px] font-bold text-[hsl(var(--pv-ink))] disabled:opacity-60"
                >
                  📞 {sendingCleaner ? 'Sending…' : 'Notify cleaner'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDeleteId(detailBooking.id)}
                className="rounded-[10px] border border-[hsl(var(--pv-danger))] py-2.5 text-[12px] font-bold text-[hsl(var(--pv-danger))]"
              >
                🗑 Delete booking
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this booking?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the booking. This can&rsquo;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const id = confirmDeleteId!;
                setConfirmDeleteId(null);
                setDetailBooking(null);
                try {
                  await deleteBooking.mutateAsync(id);
                  toast.success('Booking deleted');
                } catch (err) {
                  toast.error('Failed to delete booking');
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddBookingDialog
        open={addOpen || !!editingBooking}
        onOpenChange={(open) => {
          if (!open) { setAddOpen(false); setEditingBooking(null); }
        }}
        booking={editingBooking}
        defaultDate={new Date(`${selected}T12:00:00`)}
      />
    </>
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

export function BenchmarksMobileBody() {
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
    <>
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


export function SchedulerWiredPage() {
  return (
    <AdminLayout title="Scheduler" subtitle="Mobile layout, live data">
      <SchedulerMobileBody />
    </AdminLayout>
  );
}

export function BenchmarksWiredPage() {
  return (
    <AdminLayout title="Benchmarks" subtitle="Mobile layout, live data">
      <BenchmarksMobileBody />
    </AdminLayout>
  );
}
