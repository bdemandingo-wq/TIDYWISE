import { useMemo, useState } from 'react';
import {
  ListShell,
  ListRow,
  ListSectionLabel,
  StatCard,
  Card,
  CardTitle,
  Button,
  StatusBadge,
  SettingsRow,
  type ListState,
} from '@/components/portal-v2';
import {
  adminBookingStatusBadge,
  paymentBadge,
  bookingServiceName,
} from '@/lib/bookingStatus';

/**
 * Screen 4a — /dashboard/bookings at 390px.
 *
 * Preview route only, static data. Additive: the live BookingsPage is
 * untouched.
 *
 * ── Built from the DESKTOP table ──────────────────────────────────────
 *
 * The desktop table (BookingsPage.tsx:2077) has ten columns. Each is
 * carried, moved, or given up with a reason — nothing dropped silently.
 *
 *   select checkbox  GIVEN UP as a per-row control: ~40px of a 390px row
 *                    for a bulk mode most sessions never enter.
 *   Booking          CARRIED as the row's lead.
 *   Customer         CARRIED — name AND the email beneath it. The avatar
 *                    initial gives way: the lead slot holds the booking
 *                    number, which is the sharper identifier in a list
 *                    people search by number.
 *   Service          CARRIED, including the Re-clean rule.
 *   Schedule         CARRIED with the year — 'MMM d, yyyy' as desktop has
 *                    it. A booking from 2025 must not read like this week.
 *                    On its own line: sharing one with the service name
 *                    truncated the TIME away at 390px, and the time of a
 *                    clean is not an optional detail.
 *   Staff            CARRIED on its own line: team joined, else the name,
 *                    else "Unassigned".
 *   Status           CARRIED with the admin vocabulary (see below).
 *   Payment          CARRIED as a badge. Its leading glyph (✓ ○ ◐ ↩) gives
 *                    way — it is redundant beside the word it precedes,
 *                    and tone already carries the same signal.
 *   Amount           CARRIED.
 *   Actions          The kebab GIVES WAY to the row tap, which is what the
 *                    live mobile branch already does: tapping a booking
 *                    opens the action sheet holding those same actions.
 *
 * Also carried, and easy to miss: the Schedule cell hides a reminder
 * button when one is due or overdue. The action needs a row tap at this
 * width, but the fact that a reminder is outstanding stays on the row as
 * a badge rather than disappearing.
 *
 * What gives at 390px: columns become stacked fields, so values can no
 * longer be compared down a column. Money and the badges stay pinned to
 * the right edge so they remain comparable row to row, which is the
 * closest a single-column list gets to a table.
 *
 * The mobile branch that already exists (line 1963) was NOT the model —
 * it carries less than the table does. Two things it gets wrong, which
 * this screen does not inherit:
 *
 *   1. Its status pill collapses the whole enum into three outcomes —
 *      cancelled, completed, and "scheduled" for everything else. A
 *      booking that is `pending` (nobody has paid), `in_progress`
 *      (someone is in the house right now), `no_show` or `rescheduled`
 *      all read "scheduled". Those are four different days for an owner.
 *
 *   2. That "scheduled" pill is painted `bg-destructive/10
 *      text-destructive` — red — with a blue dot inside it. Ordinary
 *      upcoming work looks like a problem, so the colour carries no
 *      signal and the real problems do not stand out.
 *
 * It also shows no email and drops the year from the date.
 *
 * ── The two recurring patterns, checked ───────────────────────────────
 *
 *   Slugs where labels were assumed: found, and it is not `extras` this
 *   time — BookingsPage renders no extras at all. It is the status enum.
 *   The admin screen has its own `statusLabels` where `pending` reads
 *   "pending payment" and `confirmed` reads "scheduled". Reusing the
 *   cleaner-facing bookingStatusBadge() here would have relabelled every
 *   row and dropped the money framing the screen is built around. Hence
 *   adminBookingStatusBadge().
 *
 *   Single-row helpers on multi-row tables: checked all four `.single()`
 *   calls in useBookings.ts (lines 299, 394, 403, 538). Every one filters
 *   on `.eq('id', …)`, the primary key, so none can match the dual-org
 *   staff bug. Clean.
 *
 * ── Separate finding, not fixed here ──────────────────────────────────
 *
 * useBookings pages with `.range()` ordered by `scheduled_at` alone
 * (useBookings.ts:196-198). That column is not unique — Bruce's own list has
 * four bookings at 11:00 AM — so rows can shift across page boundaries and
 * be skipped or repeated. CLAUDE.md rule 3, live in the admin list. It needs
 * a unique tiebreaker (`.order('id')`) and belongs in its own change.
 */

type Tab = 'all' | 'drafts' | 'quotes' | 'wages';

type Row = {
  id: string;
  booking_number: number;
  customer: string | null;
  customer_email: string | null;
  /* Desktop puts a reminder button in the Schedule cell when one is due. */
  reminder?: 'due' | 'urgent';
  service_name: string | null;
  total_amount: number | null;
  scheduled_label: string;
  status: string;
  payment_status: string | null;
  has_payment_intent?: boolean;
  staff_name?: string | null;
  team?: string[];
};

/* Amounts are pre-formatted by the caller so §5.1 holds: a row whose money
   could not be read passes "—", never a fabricated $0.00. */
const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `$${n.toFixed(2)}`;

const staffLine = (r: Row) => {
  if (r.team && r.team.length > 1) return r.team.join(', ');
  return r.staff_name || 'Unassigned';
};

const ROWS: Row[] = [
  {
    id: '1',
    booking_number: 2031,
    customer: 'Robert Washington',
    customer_email: 'rwashington@bayviewhoa.com',
    service_name: 'Standard Clean',
    total_amount: 180,
    scheduled_label: 'Aug 21, 2026 · 11:00 AM',
    status: 'confirmed',
    payment_status: null,
    has_payment_intent: true,
    staff_name: 'Bruce Wayne',
  },
  {
    id: '2',
    booking_number: 2011,
    customer: 'Daniel Mrusko',
    customer_email: 'daniel.mrusko@gmail.com',
    service_name: 'Standard Clean',
    total_amount: 112.5,
    scheduled_label: 'Aug 21, 2026 · 1:00 PM',
    status: 'in_progress',
    payment_status: 'paid',
    team: ['Bruce Wayne', 'Ana Ruiz'],
  },
  {
    id: '3',
    booking_number: 1885,
    customer: 'Bill Ohlsen',
    customer_email: 'bill@crossfitwynwood.com',
    service_name: 'Deep Clean',
    total_amount: 100,
    scheduled_label: 'Aug 16, 2026 · 1:00 PM',
    status: 'completed',
    payment_status: 'paid',
    staff_name: 'Bruce Wayne',
  },
  {
    id: '4',
    booking_number: 2044,
    customer: 'Sarah Mahoney',
    customer_email: null,
    service_name: null,
    total_amount: 0,
    scheduled_label: 'Aug 22, 2026 · 9:00 AM',
    status: 'confirmed',
    payment_status: null,
    staff_name: null,
  },
  {
    id: '5',
    booking_number: 2018,
    reminder: 'urgent',
    customer: 'Brandy Lee',
    customer_email: 'brandy@lee-properties.com',
    service_name: 'Move-Out Clean',
    total_amount: 340,
    scheduled_label: 'Aug 19, 2026 · 11:00 AM',
    status: 'pending',
    payment_status: null,
    staff_name: null,
  },
  {
    id: '6',
    booking_number: 1994,
    customer: 'Marcus Hall',
    customer_email: 'm.hall@icloud.com',
    service_name: 'Standard Clean',
    total_amount: 125,
    scheduled_label: 'Aug 14, 2026 · 2:00 PM',
    status: 'no_show',
    payment_status: 'refunded',
    staff_name: 'Ana Ruiz',
  },
  {
    id: '7',
    booking_number: 2002,
    customer: 'Priya Nair',
    customer_email: 'priya.nair@gmail.com',
    service_name: 'Deep Clean',
    total_amount: 210,
    scheduled_label: 'Aug 27, 2026 · 10:00 AM',
    status: 'rescheduled',
    payment_status: 'partial',
    staff_name: 'Bruce Wayne',
  },
  {
    id: '8',
    booking_number: 1975,
    customer: 'Kenneth Doyle',
    customer_email: 'kdoyle@outlook.com',
    service_name: 'Standard Clean',
    total_amount: null,
    scheduled_label: 'Aug 12, 2025 · 3:00 PM',
    status: 'cancelled',
    payment_status: null,
    staff_name: 'Ana Ruiz',
  },
];

const TABS: { id: Tab; label: string; count?: number }[] = [
  { id: 'all', label: 'All', count: ROWS.length },
  { id: 'drafts', label: 'Drafts', count: 3 },
  { id: 'quotes', label: 'Quotes', count: 1 },
  { id: 'wages', label: 'Wages' },
];

const STATES: { id: ListState; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Eight rows spanning every enum member the admin map names.' },
  { id: 'loading', label: 'Loading', why: 'Skeleton rows. Not an empty list — useBookings surfaces isLoading.' },
  { id: 'empty', label: 'Empty', why: 'A genuinely empty org, or a filter that matched nothing. Says which.' },
  { id: 'error', label: 'Error', why: 'useBookings throws; the list says so and offers Retry instead of showing zero bookings.' },
];

export default function BookingsPreviewPage() {
  const [state, setState] = useState<ListState>('ready');
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  /* 4d: the sheet that opens from a row. It belongs to this screen rather
     than a route of its own — tapping a booking is how you reach it. */
  const [sheetFor, setSheetFor] = useState<Row | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ROWS;
    return ROWS.filter(
      r =>
        String(r.booking_number).includes(q) ||
        (r.customer ?? '').toLowerCase().includes(q) ||
        bookingServiceName(r.service_name, r.total_amount).toLowerCase().includes(q)
    );
  }, [search]);

  /* An empty result from a search is not the same statement as an org with no
     bookings, so the copy differs. §5.1 applies to empty as much as to error. */
  const filtered = search.trim().length > 0;
  const effective: ListState = state === 'ready' && rows.length === 0 ? 'empty' : state;

  return (
    <div>
      <div className="portal-v2 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          State
        </span>
        {STATES.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setState(s.id)}
            className={
              'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
              (state === s.id
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-on-brand))]'
                : 'bg-[hsl(var(--pv-card))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {s.label}
          </button>
        ))}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {STATES.find(s => s.id === state)?.why}
        </p>
      </div>

      {/* .portal-v2 carries the --pv-* custom properties. Without it the
          tokens do not resolve and every colour silently falls back to an
          inherited value — which looked plausible against the dark shell,
          which is why it went unnoticed. */}
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <ListShell<Tab>
          title="Bookings"
          action={{ label: 'Create' }}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by name, service, or booking #..."
          onFilter={() => undefined}
          tabs={TABS}
          tab={tab}
          onTab={setTab}
          state={effective}
          empty={
            filtered
              ? {
                  title: 'No bookings match that search',
                  hint: 'Try a booking number, a customer name, or a service.',
                  action: { label: 'Clear search', onClick: () => setSearch('') },
                }
              : {
                  title: 'No bookings yet',
                  hint: 'Bookings you create or that come in from the site will show here.',
                  action: { label: 'Create booking' },
                }
          }
          errorLabel="Couldn't load bookings"
          onRetry={() => setState('ready')}
          skeletonRows={6}
        >
          {/* 4c puts four summary cards between the tabs and the list: a 2x2
              grid, 10px gaps. "Owed to you" is gold-accented and "Completed"
              carries a green label — the only two that are not neutral. */}
          <div className="grid grid-cols-2 gap-2.5 pb-1">
            <StatCard label="Total" value="439" caption="all time" />
            <StatCard label="Owed to you" value="$203.00" caption="1 completed job" tone="gold" />
            <StatCard label="Scheduled" value="42" caption="all time" />
            <StatCard label="Completed" value="388" caption="all time" tone="success" />
          </div>

          {tab === 'all' && (
          <><ListSectionLabel>{rows.length} bookings</ListSectionLabel>
          {rows.map(r => (
            <ListRow
              key={r.id}
              lead={{ kind: 'ref', label: `#${r.booking_number}` }}
              title={r.customer ?? 'Unknown'}
              /* Service, schedule, email and staff each get their own line.
                 Packing service + schedule into one meta line truncated the
                 TIME away at 390px — and the time of a clean is not an
                 optional detail. Desktop gives Schedule a cell of its own;
                 here it gets a line of its own. */
              meta={bookingServiceName(r.service_name, r.total_amount)}
              lines={[r.scheduled_label, r.customer_email ?? 'No email', staffLine(r)]}
              money={money(r.total_amount)}
              status={[
                adminBookingStatusBadge(r.status),
                paymentBadge(r.payment_status, r.has_payment_intent),
                /* Desktop puts a reminder button in the Schedule cell when one
                   is due. The action needs a row tap here, but the fact that
                   one is outstanding is carried rather than dropped. */
                ...(r.reminder
                  ? [{ tone: r.reminder === 'urgent' ? ('danger' as const) : ('warn' as const),
                       label: r.reminder === 'urgent' ? 'Reminder overdue' : 'Reminder due' }]
                  : []),
              ]}
              onClick={() => setSheetFor(r)}
            />
          ))}
          </>
          )}

          {/* 7d — Quotes. A quote is money that has NOT been agreed, so the
              screen leads with total quote value and every row carries an
              expiry. A quote past its validity date is not pending, it is
              gone, and the date is the only thing that says which. */}
          {tab === 'quotes' && (
            <>
              <div className="grid grid-cols-2 gap-2.5 pb-1">
                <StatCard label="Total quote value" value="$1,541.00" caption="4 quotes" />
                <StatCard label="Pending" value="4" caption="0 accepted" tone="gold" />
              </div>
              {[
                { n: 47, who: 'Barbara', amount: '$438.00', svc: 'Move In/Out Clean', email: 'barbara@gmail.com', until: 'Aug 14', expired: true },
                { n: 51, who: 'Devon Cross', amount: '$1,280.00', svc: 'Office Clean', email: 'devon@crossmgmt.co', until: 'Aug 29', expired: false },
              ].map(q => (
                <ListRow
                  key={q.n}
                  lead={{ kind: 'ref', label: `#${q.n}` }}
                  title={q.who}
                  meta={q.svc}
                  lines={[q.email, `Valid until ${q.until}`]}
                  money={q.amount}
                  status={[
                    { tone: 'warn', label: 'Pending' },
                    ...(q.expired ? [{ tone: 'danger' as const, label: 'Expired' }] : []),
                  ]}
                  onClick={() => undefined}
                />
              ))}
            </>
          )}

          {/* 7e — Cleaner Wages, bulk edit. Two applies, deliberately
              separate: a job total and a wage are different numbers, and
              one Apply for both would let a mistyped rate rewrite what the
              customer is charged. */}
          {tab === 'wages' && (
            <>
              <Card>
                <CardTitle>Bulk edit selected (0)</CardTitle>
                <p className="mt-0.5 text-[11px] font-normal text-[hsl(var(--pv-ink-3))]">
                  Hourly or percentage, per booking.
                </p>
                <div className="mt-2.5">
                  <SettingsRow
                    kind="input"
                    label="Job total"
                    value="150"
                    onChange={() => undefined}
                    inputType="number"
                    suffix="$"
                    action={{ label: 'Apply' }}
                  />
                  <SettingsRow kind="value" label="Wage type" value="Flat rate" onClick={() => undefined} />
                  <SettingsRow
                    kind="input"
                    label="Rate"
                    value="25"
                    onChange={() => undefined}
                    inputType="number"
                    suffix="$/hr"
                    action={{ label: 'Apply wage' }}
                  />
                </div>
              </Card>

              {rows.slice(0, 3).map(r => (
                <ListRow
                  key={r.id}
                  lead={{ kind: 'ref', label: `#${r.booking_number}` }}
                  title={r.customer ?? 'Unknown'}
                  meta={bookingServiceName(r.service_name, r.total_amount)}
                  lines={[staffLine(r)]}
                  money={money(r.total_amount)}
                  status={[{ tone: 'info', label: 'Flat $25/hr' }]}
                  onClick={() => undefined}
                />
              ))}
            </>
          )}

          {tab === 'drafts' && (
            <Card>
              <CardTitle>3 drafts</CardTitle>
              <p className="mt-1 text-[11.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
                Bookings started but never confirmed. They are not on anyone&rsquo;s
                calendar and nobody has been charged.
              </p>
            </Card>
          )}
        </ListShell>
      </div>

      {/* 4d — the booking action sheet. Grouped, because the actions are not
          peers: viewing is safe, completing changes pay, marking paid moves
          money. The comp groups them under BOOKING / PAYMENTS / COMMS
          headings and this keeps that, so a destructive tap is never
          adjacent to a harmless one by accident. */}
      {sheetFor && (
        <div className="portal-v2 fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="max-h-[85dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[20px] bg-[hsl(var(--pv-surface))] px-5 pb-6 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-extrabold tabular-nums text-[hsl(var(--pv-brand))]">
                #{sheetFor.booking_number}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-[hsl(var(--pv-ink))]">
                {sheetFor.customer ?? 'Unknown'}
              </span>
              <span className="text-[14px] font-extrabold tabular-nums text-[hsl(var(--pv-ink))]">
                {money(sheetFor.total_amount)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge {...adminBookingStatusBadge(sheetFor.status)} />
              <StatusBadge {...paymentBadge(sheetFor.payment_status, sheetFor.has_payment_intent)} />
            </div>

            {[
              { group: 'Booking', items: ['View details', 'Reschedule', 'Assign cleaner'] },
              { group: 'Payments', items: ['Mark complete & adjust pay', 'Mark paid'] },
              { group: 'Comms', items: ['Message customer', 'Resend confirmation'] },
            ].map(g => (
              <div key={g.group} className="mt-4">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-[hsl(var(--pv-ink-3))]">
                  {g.group}
                </p>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {g.items.map(i => (
                    <button
                      key={i}
                      type="button"
                      className="min-h-[44px] rounded-[10px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-bg))] px-3.5 text-left text-[12.5px] font-bold text-[hsl(var(--pv-ink))]"
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="mt-4">
              <Button variant="secondary" fullWidth className="rounded-[10px]" onClick={() => setSheetFor(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
