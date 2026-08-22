import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useBookings, useDraftBookings, type BookingWithDetails } from '@/hooks/useBookings';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { queryPhase } from '@/lib/queryState';
import {
  BookingsListView,
  useBookingSearch,
  StatCard,
  ListRow,
  ListSectionLabel,
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

type Tab = 'all' | 'drafts' | 'quotes' | 'wages';

export function BookingsMobileBody() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const bookingsQ = useBookings();
  const draftsQ = useDraftBookings();
  const orgTz = useOrgTimezone();

  /* 4c's Quotes tab. A quote is money that has NOT been agreed, and the comp
     puts an expiry on every row — a quote past valid_until is not pending, it
     is gone, and the date is the only thing that says which. */
  const quotesQ = useQuery({
    queryKey: ['bookings-v2-quotes', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('quotes')
        .select('id, quote_number, total_amount, status, valid_until, created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

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

  /* ── Drafts tab: matches BookingsPage, deliberately ────────────────────
     BookingsPage has always shown true is_draft rows PLUS non-draft rows
     sitting on pending status and pending payment. Counting only is_draft
     here showed 1 where the live screen showed 32, which reads as data
     loss on a phone even though nothing was lost.

     useBookings filters is_draft out, so the two sets are disjoint and
     concatenating cannot double-count.

     The label is the honest part. 31 of these 32 are not drafts — they
     are finished-or-scheduled bookings that have not been paid, worth
     $6,056 with 26 of them already in the past. A row that says
     "Draft — not booked" about an unpaid job is wrong, so each row says
     which of the two it actually is. The tab is still one tab; splitting
     it properly is a separate decision. */
  const draftRows = useMemo(() => {
    const trueDrafts = (draftsQ.data ?? []).map(d => ({ row: d, unpaid: false }));
    const unpaid = (bookingsQ.data ?? [])
      .filter(b => b.status === 'pending' && b.payment_status === 'pending')
      .map(b => ({ row: b, unpaid: true }));
    return [...trueDrafts, ...unpaid];
  }, [draftsQ.data, bookingsQ.data]);
  const unpaidCount = draftRows.filter(d => d.unpaid).length;


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

  /* ── 4c's four summary cards, from real data ────────────────────────────
     §5.1 applies here as much as to the rows. "Owed to you" is MONEY, so on a
     failed read it passes "—" with the default tone rather than a gold $0.00 —
     which would read as "nothing outstanding" when the truth is "we could not
     check". The counts drop to "—" for the same reason: a confident 0 is a
     claim.

     The values are the comp's four, computed rather than assumed:
       Total       non-draft bookings
       Owed to you completed work that has not been paid for
       Scheduled   status = confirmed
       Completed   status = completed                                        */
  const cards = useMemo(() => {
    const src = (bookingsQ.data ?? []) as any[];
    const completed = src.filter(b => b.status === 'completed');
    const owedRows = completed.filter(b => b.payment_status !== 'paid');
    const owed = owedRows.reduce((sum, b) => sum + Number(b.total_amount ?? 0), 0);
    return {
      total: src.length,
      owed,
      owedJobs: owedRows.length,
      scheduled: src.filter(b => b.status === 'confirmed').length,
      completed: completed.length,
    };
  }, [bookingsQ.data]);

  const ready = phase === 'ready';
  const dash = (v: string) => (ready ? v : '—');

  const summary = (
    <div className="grid grid-cols-2 gap-2.5 pb-1">
      <StatCard label="Total" value={dash(String(cards.total))} caption="all time" />
      <StatCard
        label="Owed to you"
        value={dash(`$${cards.owed.toFixed(2)}`)}
        caption={ready ? `${cards.owedJobs} completed job${cards.owedJobs === 1 ? '' : 's'}` : 'completed but unpaid'}
        /* Gold only when the figure is real. An errored card takes the default
           tone so it cannot read as an alarming amount. */
        tone={ready ? 'gold' : 'default'}
      />
      <StatCard label="Scheduled" value={dash(String(cards.scheduled))} caption="all time" />
      <StatCard
        label="Completed"
        value={dash(String(cards.completed))}
        caption="all time"
        tone={ready ? 'success' : 'default'}
      />
    </div>
  );

  const tabs = [
    { id: 'all' as Tab, label: 'All', count: all.length },
    { id: 'drafts' as Tab, label: 'Drafts & unpaid', count: draftRows.length },
    { id: 'quotes' as Tab, label: 'Quotes', count: (quotesQ.data ?? []).length },
    { id: 'wages' as Tab, label: 'Wages' },
  ];

  const fmtDate = (d: string) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: orgTz || 'UTC' })
      .format(new Date(`${String(d).slice(0, 10)}T12:00:00Z`));

  /* Today in the ORG's timezone — valid_until is a DATE, so comparing it to a
     device clock expires a quote a day early west of the business. */
  const orgToday = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: orgTz || 'UTC',
  }).format(new Date());

  const tabBody =
    tab === 'all' ? undefined : (
      <>
        {tab === 'drafts' && (
          <>
            <ListSectionLabel>
              {unpaidCount > 0
                ? `${draftRows.length - unpaidCount} draft${draftRows.length - unpaidCount === 1 ? '' : 's'} · ${unpaidCount} awaiting payment`
                : `${draftRows.length} draft${draftRows.length === 1 ? '' : 's'}`}
            </ListSectionLabel>
            {draftRows.map(({ row: d, unpaid }: any) => (
              <ListRow
                key={d.id}
                lead={{ kind: 'ref', label: `#${d.booking_number}` }}
                title={d.customer ? `${d.customer.first_name ?? ''} ${d.customer.last_name ?? ''}`.replace(/\s+/g, ' ').trim() || 'Unknown' : 'Unknown'}
                meta={unpaid ? 'Booked — awaiting payment' : 'Draft — not booked'}
                lines={[d.scheduled_at ? fmt(d.scheduled_at) : 'No date set']}
                money={d.total_amount == null ? '—' : `$${Number(d.total_amount).toFixed(2)}`}
              />
            ))}
            {draftRows.length === 0 && (
              <p className="px-4 py-6 text-center text-[12.5px] font-semibold text-[hsl(var(--pv-ink-3))]">
                No drafts.
              </p>
            )}
          </>
        )}

        {tab === 'quotes' && (
          <>
            <ListSectionLabel>{(quotesQ.data ?? []).length} quotes</ListSectionLabel>
            {(quotesQ.data ?? []).map((qt: any) => {
              /* A quote past its validity date is not pending, it is gone —
                 and the date is the only thing that says which. */
              const expired = !!qt.valid_until && qt.valid_until < orgToday && qt.status !== 'accepted';
              return (
                <ListRow
                  key={qt.id}
                  lead={{ kind: 'ref', label: `#${qt.quote_number}` }}
                  title={qt.status === 'accepted' ? 'Accepted' : expired ? 'Expired' : 'Awaiting reply'}
                  meta={qt.valid_until ? `Valid until ${fmtDate(qt.valid_until)}` : 'No expiry set'}
                  lines={[qt.created_at ? `Sent ${fmtDate(qt.created_at)}` : null].filter(Boolean) as string[]}
                  money={qt.total_amount == null ? '—' : `$${Number(qt.total_amount).toFixed(2)}`}
                  status={[
                    expired
                      ? { tone: 'danger' as const, label: 'Expired' }
                      : qt.status === 'accepted'
                        ? { tone: 'success' as const, label: 'Accepted' }
                        : { tone: 'warn' as const, label: 'Open' },
                  ]}
                />
              );
            })}
            {(quotesQ.data ?? []).length === 0 && (
              <p className="px-4 py-6 text-center text-[12.5px] font-semibold text-[hsl(var(--pv-ink-3))]">
                No quotes.
              </p>
            )}
          </>
        )}

        {tab === 'wages' && (
          <p className="px-4 py-6 text-[12.5px] font-semibold leading-[1.5] text-[hsl(var(--pv-ink-2))]">
            Cleaner wages live on their own screen, where each figure carries
            whether it is a locked-in amount or an estimate.{' '}
            <button
              type="button"
              onClick={() => navigate('/dashboard/payroll-v2')}
              className="font-bold text-[hsl(var(--pv-brand))]"
            >
              Open payroll →
            </button>
          </p>
        )}
      </>
    );

  return (
    <>
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <BookingsListView<Tab>
          phase={listState}
          rows={rows}
          search={search}
          onSearch={setSearch}
          tabs={tabs}
          tab={tab}
          onTab={setTab}
          summary={summary}
          sectionLabel={
            search.trim()
              ? `${rows.length} of ${all.length} bookings`
              : `${all.length} bookings`
          }
          onSelect={r => navigate(`/dashboard/bookings?booking=${r.id}`)}
          onRetry={() => {
            bookingsQ.refetch();
            draftsQ.refetch();
            quotesQ.refetch();
          }}
        >
          {tabBody}
        </BookingsListView>
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


export default function BookingsWiredPage() {
  return (
    <AdminLayout title="Bookings" subtitle="Mobile layout, live data">
      <BookingsMobileBody />
    </AdminLayout>
  );
}
