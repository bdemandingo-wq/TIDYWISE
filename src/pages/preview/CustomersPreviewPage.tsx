import { useMemo, useState } from 'react';
import {
  ListShell,
  ListSectionLabel,
  PersonRow,
  PersonRowMenu,
  type ListState,
} from '@/components/portal-v2';

/**
 * Screen 4b — /dashboard/customers at 390px.
 *
 * Preview route only, static data. Additive: the live CustomersPage is
 * untouched.
 *
 * ── Built from the DESKTOP table, not the mobile branch ──────────────
 *
 * The desktop table (CustomersPage.tsx:1066) has nine columns. Every one is
 * accounted for below — carried, moved, or given up with a reason. Nothing
 * is dropped silently.
 *
 *   select checkbox  GIVEN UP as a per-row control. The live mobile branch
 *                    already replaces it with long-press batch mode, and a
 *                    permanent checkbox column costs ~40px of a 390px row
 *                    to a mode most sessions never enter. Not modelled in a
 *                    static preview; the affordance is long-press, as today.
 *   Customer         CARRIED — avatar, name, and the created-at date that
 *                    sits under the name on desktop.
 *   Status           CARRIED as a badge, plus the campaign-enrolment badges
 *                    that share that cell. Those enrolments appear nowhere
 *                    in the mobile branch at all.
 *   Contact          CARRIED in full — email AND phone. The mobile branch
 *                    shows phone only, so email is a fact this screen
 *                    restores rather than one it invents.
 *   Address          CARRIED on its own line. The mobile branch hides it
 *                    behind an expand tap; at 390px it fits as a truncated
 *                    line, and a truncated address is still an address.
 *   Revenue          CARRIED.
 *   Bookings         CARRIED.
 *   Last Job         CARRIED, in the desktop's own 'MMM d, yyyy' format with
 *                    its em-dash fallback — not the mobile branch's shorter
 *                    'MMM d', which loses the year on a customer who last
 *                    booked in 2024.
 *   Actions          CARRIED as the kebab.
 *
 * What genuinely gives at 390px, and why:
 *
 *   - The four sortable headers (Customer, Status, Revenue, Last Job) cannot
 *     be column headers without a column layout. They collapse into the one
 *     filter/sort control in the list header. The sorts themselves are not
 *     lost; the affordance changes.
 *   - Columns become stacked fields, so the eye can no longer compare one
 *     value down a column. That is the real cost of 390px and no amount of
 *     layout removes it. It is why Revenue, Bookings and Last Job stay
 *     together on one wrapped line: they at least stay comparable row to row.
 *   - Long values truncate rather than wrap, so row height stays even and
 *     the list stays scannable.
 *
 * One deliberate divergence from desktop, not a silent one: desktop renders
 * `fmt(cStats?.total_revenue || 0)`, so a customer whose stats did not load
 * shows $0.00 — indistinguishable from a customer who has genuinely spent
 * nothing. §5.1 does not allow money to render zero on a failed read, so a
 * missing stats row reads "History unavailable" here instead.
 *
 * ── Recurring pattern 1: slugs where labels were assumed ──────────────
 *
 * Found, and it is the sharpest instance yet. `customer_status = 'active'`
 * does NOT render "Active" — getStatusBadge (line 483) renders **"Customer"**.
 * The vocabulary is Customer / Lead / Inactive, and the whole screen is
 * organised around that distinction: two of the four tabs are "Customers"
 * and "Leads". Assuming the obvious label would have renamed the central
 * concept of the screen.
 *
 * Worse, the status is not simply read. getEffectiveStatus (line 430)
 * OVERRIDES the stored column to 'active' when the customer has any
 * bookings or revenue:
 *
 *     stats.total_bookings > 0 || stats.total_revenue > 0  ->  'active'
 *     otherwise                                            ->  customer_status || 'lead'
 *
 * So "Customer" is derived from the stats read, not from the customer row.
 * Two consequences fall out of that, both modelled here rather than faked:
 *
 *   - The override ignores the stored value entirely, so marking someone
 *     inactive — which the bulk action at line 392 does by writing
 *     customer_status = 'inactive' — has no visible effect on anyone with a
 *     single booking or a dollar of revenue. They keep reading "Customer"
 *     and stay in the Customers tab. The Inactive badge is only reachable
 *     for a customer with no history at all.
 *   - Because the derivation depends on the stats query, and that query is
 *     destructured `{ data: bookingStats = [] }` at line 130 with no error
 *     handling, a failed stats read silently demotes every real customer to
 *     their stored status — for most rows, "Lead". The list would look like
 *     a pipeline of prospects rather than a book of business.
 *
 * ── Recurring pattern 2: single-row helpers ───────────────────────────
 *
 * No `.single()` or `.maybeSingle()` anywhere in the customers read path.
 * Nothing here can reproduce the dual-org staff bug.
 *
 * ── §5.1: the live screen has no error state ──────────────────────────
 *
 * CustomersPage:112 reads `const { data: customers = [], isLoading } =
 * useCustomers()` — `error` is never destructured, and the mobile branch
 * is `isLoading ? skeletons : length === 0 ? <EmptyState/> : rows`. There
 * is no third branch. A failed read renders "no customers yet" to an org
 * that has thousands. Same bug class as OnboardingProgress, on a bigger
 * screen. This preview shows what the error state should say; fixing the
 * live page is a separate change.
 */

type Tab = 'all' | 'customers' | 'leads' | 'non_recurring';

type Person = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state_code: string | null;
  zip_code: string | null;
  created_at: string;
  campaigns?: string[];
  customer_status: string | null;
  is_recurring: boolean;
  duplicate?: boolean;
  /* Undefined models a stats read that returned nothing for this customer —
     which is not the same as zero bookings. See statusOf(). */
  stats?: { total_bookings: number; total_revenue: number; last_booking_date: string | null };
};

/* Mirrors getEffectiveStatus(). Kept as one function so the derivation stays
   visible: a customer is a "Customer" because of their bookings, not because
   of a column. */
const statusOf = (p: Person): 'active' | 'lead' | 'inactive' => {
  if (p.stats && (p.stats.total_bookings > 0 || p.stats.total_revenue > 0)) return 'active';
  return (p.customer_status as 'active' | 'lead' | 'inactive') || 'lead';
};

/* Mirrors getStatusBadge(). 'active' reads "Customer", not "Active". */
const statusBadge = (s: string) =>
  s === 'active'
    ? { tone: 'success' as const, label: 'Customer' }
    : s === 'inactive'
      ? { tone: 'info' as const, label: 'Inactive' }
      : { tone: 'warn' as const, label: 'Lead' };

const PEOPLE: Person[] = [
  {
    id: '1',
    first_name: 'Robert',
    last_name: 'Washington',
    email: 'rwashington@bayviewhoa.com',
    phone: '(305) 555-0142',
    address: '2381 Bayview Lane',
    city: 'North Miami',
    state_code: 'FL',
    zip_code: '33181',
    created_at: '2024-03-11',
    campaigns: ['Spring Refresh'],
    customer_status: 'active',
    is_recurring: true,
    stats: { total_bookings: 24, total_revenue: 3180, last_booking_date: '2026-08-14' },
  },
  {
    id: '2',
    first_name: 'Bill',
    last_name: 'Ohlsen',
    email: 'bill@crossfitwynwood.com',
    phone: '(786) 555-0119',
    address: '7269 NE 4th Ave',
    city: 'Miami',
    state_code: 'FL',
    zip_code: '33138',
    created_at: '2025-01-22',
    campaigns: [],
    customer_status: 'lead',
    is_recurring: true,
    /* Stored as a lead, but has bookings — so the screen calls them a
       Customer. The stored column never changes; the label is derived. */
    stats: { total_bookings: 9, total_revenue: 900, last_booking_date: '2026-08-16' },
  },
  {
    id: '3',
    first_name: 'Priya',
    last_name: 'Nair',
    email: 'priya.nair@gmail.com',
    phone: '(954) 555-0188',
    address: null,
    city: null,
    state_code: null,
    zip_code: null,
    created_at: '2026-07-30',
    campaigns: ['Win-back'],
    customer_status: 'lead',
    is_recurring: false,
    stats: { total_bookings: 0, total_revenue: 0, last_booking_date: null },
  },
  {
    id: '4',
    first_name: 'Marcus',
    last_name: 'Hall',
    email: null,
    phone: null,
    address: '1736 SW 13th St',
    city: 'Fort Lauderdale',
    state_code: 'FL',
    zip_code: '33312',
    created_at: '2026-08-02',
    campaigns: [],
    customer_status: 'lead',
    is_recurring: false,
    duplicate: true,
    stats: { total_bookings: 0, total_revenue: 0, last_booking_date: null },
  },
  {
    id: '5',
    first_name: 'Kenneth',
    last_name: 'Doyle',
    email: 'kdoyle@outlook.com',
    phone: '(305) 555-0170',
    address: '48 Southeast 7th Street',
    city: 'Dania Beach',
    state_code: 'FL',
    zip_code: '33004',
    created_at: '2023-09-14',
    campaigns: [],
    customer_status: 'inactive',
    is_recurring: false,
    /* Stored inactive, but has bookings — so the override wins and this row
       still reads "Customer". Worth seeing: it means the bulk "mark inactive"
       action has no visible effect on anyone with history. */
    stats: { total_bookings: 3, total_revenue: 0, last_booking_date: '2025-11-02' },
  },
  {
    id: '7',
    first_name: 'Alicia',
    last_name: 'Fenn',
    email: 'alicia.fenn@gmail.com',
    phone: '(305) 555-0164',
    address: null,
    city: null,
    state_code: null,
    zip_code: null,
    created_at: '2026-06-05',
    campaigns: ['Win-back', 'Referral push'],
    customer_status: 'inactive',
    is_recurring: false,
    /* Zero bookings AND zero revenue is the only way the stored 'inactive'
       survives the override, so this is the one row the Inactive badge can
       actually reach. */
    stats: { total_bookings: 0, total_revenue: 0, last_booking_date: null },
  },
  {
    id: '6',
    first_name: 'Brandy',
    last_name: 'Lee',
    email: 'brandy@lee-properties.com',
    phone: '(754) 555-0133',
    address: '801 NE 18th Ct',
    city: 'Fort Lauderdale',
    state_code: 'FL',
    zip_code: '33305',
    created_at: '2025-11-30',
    campaigns: [],
    customer_status: 'active',
    is_recurring: true,
    /* No stats row came back for this person. The live screen drops the whole
       stats line when `cStats` is falsy, so a reader cannot tell "new
       customer" from "we could not read their history". */
    stats: undefined,
  },
];

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* Pure integer date maths — no device-local calendar getters. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/* Desktop renders Last Job as 'MMM d, yyyy'. The year matters: without it a
   customer who last booked in 2024 is indistinguishable from one who booked
   last week. */
const longDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const monthYear = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

const addressOf = (p: Person) =>
  [p.address, p.city, p.state_code, p.zip_code].filter(Boolean).join(', ');

/* Revenue, Bookings and Last Job stay on one wrapped line so they remain
   comparable between rows — the nearest thing to a column that 390px allows. */
const factsFor = (p: Person): string[] => {
  if (!p.stats) return ['History unavailable'];
  return [
    `${p.stats.total_bookings} bookings`,
    money(p.stats.total_revenue),
    `Last job: ${p.stats.last_booking_date ? longDate(p.stats.last_booking_date) : '—'}`,
  ];
};

/* Contact and Address are long-form, so they get their own lines. */
const linesFor = (p: Person): string[] => {
  const contact = [p.email, p.phone].filter(Boolean).join(' · ');
  return [contact || 'No contact details', addressOf(p) || 'No address on file'];
};

const TABS: { id: Tab; label: string; count?: number }[] = [
  { id: 'all', label: 'All', count: PEOPLE.length },
  { id: 'customers', label: 'Customers', count: PEOPLE.filter(p => statusOf(p) === 'active').length },
  { id: 'leads', label: 'Leads', count: PEOPLE.filter(p => statusOf(p) === 'lead').length },
  { id: 'non_recurring', label: 'One-off', count: PEOPLE.filter(p => !p.is_recurring).length },
];

const STATES: { id: ListState | 'row-error'; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Bill Ohlsen is stored as a lead but reads "Customer"; Kenneth Doyle is stored inactive and also reads "Customer" — both derived from bookings, not from the column. Only Alicia Fenn, with no history at all, reaches the Inactive badge.' },
  { id: 'loading', label: 'Loading', why: 'Skeleton rows, matching the eight the live screen already shows.' },
  { id: 'empty', label: 'Empty', why: 'Distinguishes an org with no customers from a search that matched nothing.' },
  { id: 'error', label: 'Error', why: 'The state the live screen does not have — today a failed read renders EmptyState instead.' },
  { id: 'row-error', label: 'One row failed', why: 'PersonRow state="error": name kept, actions dropped, and never the inactive treatment — dimming would claim the person is deactivated.' },
];

export default function CustomersPreviewPage() {
  const [state, setState] = useState<ListState | 'row-error'>('ready');
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');

  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PEOPLE.filter(p => {
      const name = `${p.first_name} ${p.last_name}`.toLowerCase();
      const matchesSearch =
        !q || name.includes(q) || (p.phone ?? '').includes(q) || (p.email ?? '').toLowerCase().includes(q);
      const s = statusOf(p);
      const matchesTab =
        tab === 'all' ||
        (tab === 'customers' && s === 'active') ||
        (tab === 'leads' && s === 'lead') ||
        (tab === 'non_recurring' && !p.is_recurring);
      return matchesSearch && matchesTab;
    });
  }, [search, tab]);

  const filtered = search.trim().length > 0 || tab !== 'all';
  const shellState: ListState =
    state === 'row-error' ? 'ready' : state === 'ready' && people.length === 0 ? 'empty' : (state as ListState);

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
                ? 'bg-[hsl(var(--pv-brand))] text-[hsl(var(--pv-brand-ink))]'
                : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
            }
          >
            {s.label}
          </button>
        ))}
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {STATES.find(s => s.id === state)?.why}
        </p>
      </div>

      <div className="mx-auto w-full max-w-[430px]">
        <ListShell<Tab>
          title="Customers"
          action={{ label: 'Add' }}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by name, email, or phone..."
          onFilter={() => undefined}
          tabs={TABS}
          tab={tab}
          onTab={setTab}
          state={shellState}
          empty={
            filtered
              ? {
                  title: 'Nobody matches that',
                  hint: 'Try a different name, phone number, or tab.',
                  action: { label: 'Clear search', onClick: () => { setSearch(''); setTab('all'); } },
                }
              : {
                  title: 'No customers yet',
                  hint: 'People you add, or who book through your site, will show here.',
                  action: { label: 'Add customer' },
                }
          }
          errorLabel="Couldn't load customers"
          onRetry={() => setState('ready')}
          skeletonRows={8}
        >
          <ListSectionLabel>{people.length} people</ListSectionLabel>
          {people.map((p, i) => {
            /* One row in error, to show it next to healthy rows — that is the
               comparison that matters, since the failure has to be legible
               without being mistaken for "inactive". */
            const rowErrored = state === 'row-error' && i === 1;
            return (
              <PersonRow
                key={p.id}
                name={`${p.first_name} ${p.last_name}`}
                state={rowErrored ? 'error' : 'ready'}
                onRetry={rowErrored ? () => setState('ready') : undefined}
                inactive={!rowErrored && statusOf(p) === 'inactive'}
                lines={rowErrored ? undefined : linesFor(p)}
                facts={rowErrored ? undefined : [...factsFor(p), `Added ${monthYear(p.created_at)}`]}
                badges={
                  rowErrored
                    ? undefined
                    : [
                        statusBadge(statusOf(p)),
                        ...(p.duplicate ? [{ tone: 'warn' as const, label: 'Possible Duplicate' }] : []),
                        /* Campaign enrolments share the Status cell on desktop and
                           appear nowhere in the mobile branch. */
                        ...(p.campaigns ?? []).map(c => ({ tone: 'info' as const, label: c })),
                      ]
                }
                actions={rowErrored ? undefined : <PersonRowMenu />}
                onClick={rowErrored ? undefined : () => undefined}
              />
            );
          })}
        </ListShell>
      </div>
    </div>
  );
}
