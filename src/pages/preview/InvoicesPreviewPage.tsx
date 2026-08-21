import { useMemo, useState } from 'react';
import { ListShell, ListRow, ListSectionLabel, type ListState } from '@/components/portal-v2';
import { formatInvoiceNumber } from '@/lib/invoiceUtils';

/**
 * Screen 4d — /dashboard/invoices at 390px.
 *
 * Preview route only, static data. Additive: the live InvoicesPage is
 * untouched. Built from the DESKTOP table (InvoicesPage.tsx:~500), which has
 * seven columns.
 *
 *   Invoice #  CARRIED as the row's lead, through the real
 *              formatInvoiceNumber() so the padding matches ("INV-0042").
 *   Customer   CARRIED — name AND email.
 *   Amount     CARRIED.
 *   Status     CARRIED via the STATUS_CONFIG labels.
 *   Date       CARRIED as 'MMM d, yyyy'.
 *   Due Date   CARRIED, with the desktop's '-' fallback, on the line directly
 *              under the issue date. The two have to stay adjacent — the pair
 *              is what tells you whether an invoice is late — but joined on
 *              one line the due year fell off the end at this width.
 *   Actions    The kebab GIVES WAY to the row tap, as on bookings and leads.
 *
 * What gives at 390px: the status filter is a row of five counted tabs on
 * desktop (draft / sent / paid / overdue / cancelled). Five tabs plus "All"
 * do not fit, so the four that carry an action live in the tab row and
 * "cancelled" moves behind the filter control. Nothing is unreachable; one
 * status takes an extra tap.
 *
 * ── An invoice is not always addressed to a customer ──────────────────
 *
 * InvoicesPage queries customers AND leads, and getInvoiceParty() in
 * invoiceUtils resolves `invoice.customer ?? invoice.lead ?? null`, falling
 * back to "Unknown Customer". So the Customer column can hold a lead, and a
 * row can legitimately have no party at all. Both are in the fixtures — an
 * invoice to a lead is how a quote becomes money, and it would be easy to
 * model this as customer-only and never notice.
 *
 * ── Recurring pattern 1: slugs where labels were assumed ──────────────
 *
 * Checked, and clean here: the Status cell already renders
 * `statusConfig.label`, so the enum never reaches the screen raw. Unlike
 * leads, where the Source column prints the slug despite a label map
 * existing in the same file.
 *
 * ── Recurring pattern 2: single-row helpers ───────────────────────────
 *
 * None in the invoice list read path.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * Fourth instance of the swallow: InvoicesPage:169 is
 * `{ data: invoices = [], isLoading }`, and the queryFn throws correctly at
 * 183, but `error` is never destructured. A failed read renders the empty
 * state.
 *
 * The empty state itself is already right, and predates this work — there is
 * a comment in the file saying "No invoices yet" is only true of an
 * unfiltered, empty list, because with a filter on it would tell an owner
 * with 200 invoices that they have none. That distinction is matched here
 * rather than reinvented.
 */

type Tab = 'all' | 'draft' | 'sent' | 'paid' | 'overdue';

type Invoice = {
  id: string;
  invoice_number: number;
  /* Resolved the way getInvoiceParty() does: customer, else lead, else null. */
  party: { name: string; email: string | null; kind: 'customer' | 'lead' } | null;
  total_amount: number | null;
  status: string;
  created_at: string;
  due_date: string | null;
};

/* Mirrors STATUS_CONFIG in InvoicesPage. */
const STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'warn' | 'danger' }> = {
  draft: { label: 'Draft', tone: 'info' },
  sent: { label: 'Sent', tone: 'warn' },
  paid: { label: 'Paid', tone: 'success' },
  overdue: { label: 'Overdue', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'info' },
};
const statusBadge = (s: string) => STATUS[s] ?? { label: s, tone: 'info' as const };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

/* §5.1: a null amount is a read that did not produce a figure, so it renders
   as an em-dash. It never becomes $0.00, which would be a claim about what
   the customer owes. */
const money = (n: number | null) =>
  n === null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const INVOICES: Invoice[] = [
  {
    id: '1',
    invoice_number: 42,
    party: { name: 'Robert Washington', email: 'rwashington@bayviewhoa.com', kind: 'customer' },
    total_amount: 540,
    status: 'overdue',
    created_at: '2026-07-14',
    due_date: '2026-07-21',
  },
  {
    id: '2',
    invoice_number: 51,
    party: { name: 'Devon Cross', email: 'devon@crossmgmt.co', kind: 'lead' },
    total_amount: 1280,
    status: 'sent',
    created_at: '2026-08-15',
    due_date: '2026-08-22',
  },
  {
    id: '3',
    invoice_number: 47,
    party: { name: 'Bill Ohlsen', email: 'bill@crossfitwynwood.com', kind: 'customer' },
    total_amount: 100,
    status: 'paid',
    created_at: '2026-08-01',
    due_date: '2026-08-08',
  },
  {
    id: '4',
    invoice_number: 53,
    party: { name: 'Brandy Lee', email: null, kind: 'customer' },
    total_amount: 340,
    status: 'draft',
    created_at: '2026-08-18',
    /* Drafts are created without a due date until they are sent. */
    due_date: null,
  },
  {
    id: '5',
    invoice_number: 39,
    /* getInvoiceParty() returns null when neither customer nor lead resolves —
       the row still exists and still owes money. */
    party: null,
    total_amount: 210,
    status: 'cancelled',
    created_at: '2026-06-30',
    due_date: '2026-07-07',
  },
  {
    id: '6',
    invoice_number: 55,
    party: { name: 'Priya Nair', email: 'priya.nair@gmail.com', kind: 'customer' },
    /* A row whose amount did not come back. Renders "—", never $0.00. */
    total_amount: null,
    status: 'sent',
    created_at: '2026-08-19',
    due_date: '2026-08-26',
  },
];

const TABS: { id: Tab; label: string; count?: number }[] = [
  { id: 'all', label: 'All', count: INVOICES.length },
  { id: 'draft', label: 'Draft', count: INVOICES.filter(i => i.status === 'draft').length },
  { id: 'sent', label: 'Sent', count: INVOICES.filter(i => i.status === 'sent').length },
  { id: 'paid', label: 'Paid', count: INVOICES.filter(i => i.status === 'paid').length },
  { id: 'overdue', label: 'Overdue', count: INVOICES.filter(i => i.status === 'overdue').length },
];

const STATES: { id: ListState; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Six invoices: one addressed to a LEAD, one with no party at all, one whose amount did not load.' },
  { id: 'loading', label: 'Loading', why: 'Skeleton rows rather than an empty list.' },
  { id: 'empty', label: 'Empty', why: '"No invoices yet" only when unfiltered — matching the distinction the live page already makes.' },
  { id: 'error', label: 'Error', why: 'The state InvoicesPage does not have. Note no money renders at all — not $0.00.' },
];

export default function InvoicesPreviewPage() {
  const [state, setState] = useState<ListState>('ready');
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return INVOICES.filter(i => {
      const matchesSearch =
        !q ||
        formatInvoiceNumber(i.invoice_number).toLowerCase().includes(q) ||
        (i.party?.name ?? '').toLowerCase().includes(q) ||
        (i.party?.email ?? '').toLowerCase().includes(q);
      const matchesTab = tab === 'all' || i.status === tab;
      return matchesSearch && matchesTab;
    });
  }, [search, tab]);

  const filtered = search.trim().length > 0 || tab !== 'all';
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

      {/* .portal-v2 carries the --pv-* custom properties. Without it the
          tokens do not resolve and every colour silently falls back to an
          inherited value — which looked plausible against the dark shell,
          which is why it went unnoticed. */}
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <ListShell<Tab>
          title="Invoices"
          action={{ label: 'New' }}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by invoice #, name, or email..."
          onFilter={() => undefined}
          tabs={TABS}
          tab={tab}
          onTab={setTab}
          state={effective}
          empty={
            filtered
              ? {
                  title: 'No invoices match that',
                  hint: 'Try a different invoice number, name, or tab.',
                  action: { label: 'Clear search', onClick: () => { setSearch(''); setTab('all'); } },
                }
              : {
                  title: 'No invoices yet',
                  hint: 'Invoices you raise for a customer or a lead will show here.',
                  action: { label: 'New invoice' },
                }
          }
          errorLabel="Couldn't load invoices"
          onRetry={() => setState('ready')}
          skeletonRows={6}
        >
          <ListSectionLabel>{rows.length} invoices</ListSectionLabel>
          {rows.map(i => (
            <ListRow
              key={i.id}
              lead={{ kind: 'ref', label: formatInvoiceNumber(i.invoice_number) }}
              title={i.party?.name ?? 'Unknown Customer'}
              meta={i.party?.email ?? 'No email'}
              /* Two lines, not one. The pair has to stay adjacent — it is what
                 tells you whether an invoice is late — but joined on a single
                 line the due date's YEAR fell off the end at 390px ("Due Jul
                 21, 2…"), which is the third time packing independent facts
                 onto one line has deleted the last one rather than
                 compressing it. Consecutive lines keep them together and keep
                 them whole. */
              lines={[
                `Issued ${longDate(i.created_at)}`,
                `Due ${i.due_date ? longDate(i.due_date) : '-'}`,
              ]}
              money={money(i.total_amount)}
              status={[
                statusBadge(i.status),
                /* An invoice raised against a lead is a quote that has not
                   become a customer yet. Worth showing: it is the difference
                   between money owed and money hoped for. */
                ...(i.party?.kind === 'lead' ? [{ tone: 'warn' as const, label: 'Lead' }] : []),
              ]}
              onClick={() => undefined}
            />
          ))}
        </ListShell>
      </div>
    </div>
  );
}
