import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useBookings, type BookingWithDetails } from '@/hooks/useBookings';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { queryPhase } from '@/lib/queryState';
import {
  BookingsListView,
  useBookingSearch,
  type BookingsRow,
} from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * /dashboard/bookings-v2 — the mobile bookings list on real data.
 *
 * ADDITIVE. The live BookingsPage is untouched and still owns
 * /dashboard/bookings. That screen is 3,279 lines carrying bulk SMS to
 * cleaners, bulk client reminders, refunds and status changes against
 * production data; replacing it in place to try a layout is not a trade worth
 * making. This route reads the same hook and writes nothing.
 *
 * All presentation is in BookingsListView so its states stay renderable from
 * fabricated props at /dashboard/preview/bookings — the offline and failed-read
 * states in particular, which are close to impossible to produce on demand
 * against a live org.
 *
 * ── The paused-query hole this closes ─────────────────────────────────────
 *
 * BookingsPage does `const { data: bookings = [], isLoading, error }` and
 * branches isLoading -> error -> empty (:1925). That is three of the four
 * outcomes. A PAUSED query — offline with nothing cached — reports
 * isPending true, isFetching false, so isLoading is FALSE, error is null and
 * data defaults to []. It falls through to "No bookings found" while the
 * honest answer is "you are offline". queryPhase() distinguishes them.
 */

/* Live status vocabulary is mapped by adminBookingStatusBadge; nothing here
   renders a raw slug. Deliberately no `frequency` on the row: it is stored as
   a slug ('one_time', 'biweekly', 'anyday') with no label map anywhere in
   src/lib, so displaying it would print the slug. */

function toRow(b: BookingWithDetails, fmt: (iso: string) => string): BookingsRow {
  /* Team from booking_team_assignments, which returns MANY rows per booking.
     The live SMS path reads only b.staff (the single primary) and drops
     teammates; the display should not repeat that narrowing. Primary first so
     the order is stable and meaningful. */
  const team = (b.booking_team_assignments ?? [])
    .filter(a => a.staff?.name)
    .sort((x, y) => Number(!!y.is_primary) - Number(!!x.is_primary))
    .map(a => a.staff!.name);

  const customerName = b.customer
    ? `${b.customer.first_name ?? ''} ${b.customer.last_name ?? ''}`.trim() || null
    : null;

  return {
    id: b.id,
    booking_number: b.booking_number,
    customer: customerName,
    /* Truthiness, not a null check. bookings.address is null-or-present (26
       null, 0 empty across the org) but customers.address is the opposite —
       never null, empty string on 3 of 8. A `??` chain would pass '' through
       as a real value. Same trap applies to email. */
    customer_email: b.customer?.email ? b.customer.email : null,
    service_name: b.service?.name ?? null,
    total_amount: b.total_amount ?? null,
    scheduled_label: fmt(b.scheduled_at),
    status: b.status,
    payment_status: b.payment_status ?? null,
    has_payment_intent: !!b.payment_intent_id,
    staff_name: b.staff?.name ? b.staff.name : null,
    team,
  };
}

export default function BookingsWiredPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const bookingsQ = useBookings();
  const orgTz = useOrgTimezone();

  /* Formatted in the ORG's timezone. A booking at 8am in Florida must not read
     as 5am because the person looking is in California — the repo has an
     eslint rule (local/no-device-local-dates) for exactly this. */
  const fmt = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZone: orgTz || 'UTC',
    });
    return (iso: string) => f.format(new Date(iso));
  }, [orgTz]);

  const all = useMemo(
    () => (bookingsQ.data ?? []).map(b => toRow(b, fmt)),
    [bookingsQ.data, fmt],
  );
  const rows = useBookingSearch(all, search);

  const phase = queryPhase(bookingsQ);
  /* ListShell has no 'offline' — it is surfaced as an error with its own copy,
     because the one thing that must not happen is it reading as "empty". */
  const listState: ListState =
    phase === 'error' || phase === 'offline'
      ? 'error'
      : phase === 'loading'
        ? 'loading'
        : rows.length === 0
          ? 'empty'
          : 'ready';

  return (
    <AdminLayout title="Bookings" subtitle="Mobile layout, live data">
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <BookingsListView
          phase={listState}
          rows={rows}
          search={search}
          onSearch={setSearch}
          sectionLabel={
            search.trim()
              ? `${rows.length} of ${all.length} bookings`
              : `${all.length} bookings`
          }
          onSelect={r => navigate(`/dashboard/bookings?booking=${r.id}`)}
          onRetry={() => bookingsQ.refetch()}
        />
      </div>
    </AdminLayout>
  );
}
