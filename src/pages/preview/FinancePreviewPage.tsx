import { useState } from 'react';
import { ListShell, ListRow, ListSectionLabel, type ListState } from '@/components/portal-v2';

/**
 * Screen 4i — /dashboard/finance at 390px.
 *
 * Preview route only, static data. Additive: the live FinancePage is
 * untouched.
 *
 * Four tabs (transactions, pnl-calendar, sales-tax, pnl) and two tables.
 * This screen covers the transactions table — nine columns, the 289px that
 * put finance on the list — plus the sales-tax table, which is three
 * columns and lists trivially.
 *
 * ── The four money columns are a derivation, not four numbers ─────────
 *
 * Gross → Processing Fee → Net → Cleaner Pay is arithmetic: the fee comes
 * out of the gross to give the net, and the cleaner is paid from that. On
 * desktop you read the chain across the row. The live screen already
 * treats it that way — the fee cell renders `-${fmt(...)}` with an
 * explicit minus, and even its test-mode mask is '-$X.XX' — so the sign is
 * the live screen's own framing, not something added here.
 *
 * At 390px the chain goes vertical, which suits it: gross as the row's
 * headline figure, then the deductions beneath it in the order they
 * happen. Reading down is reading the same arithmetic.
 *
 * ── Recurring pattern 1: slugs where labels were assumed ──────────────
 *
 * Found again. The Status cell is `{t.payment_status}` — the raw enum,
 * unlabelled and lower-case, exactly like the Source column on leads.
 * Labelled here.
 *
 * A note on the duplication: lib/bookingStatus already has paymentBadge()
 * for precisely this, written for the bookings screen, but that lives on
 * feat/preview-bookings and this branch sits flat on main. The map is
 * repeated here rather than stacking the branches. When bookings lands,
 * this should import it instead — the two are deliberately identical so
 * that swap is a delete.
 *
 * ── Test mode ─────────────────────────────────────────────────────────
 *
 * Each money column masks to its own shape and they carry magnitude:
 * '$XXX.XX' gross, '-$X.XX' fee, '$XXX.XX' net, '$XX.XX' cleaner pay. A
 * fee is a small number and the mask says so. Preserved.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * A transaction whose figures did not load renders "—" throughout and says
 * so, rather than a chain of zeroes that would read as a free job with no
 * fee and an unpaid cleaner.
 */

type Tab = 'transactions' | 'sales-tax';

type Txn = {
  id: string;
  booking_number: number;
  scheduled_at: string;
  customer_name: string;
  service_name: string;
  gross_amount: number | null;
  processing_fee: number | null;
  net_amount: number | null;
  cleaner_pay: number | null;
  payment_status: string;
};

type TaxRow = { zip: string; transactions: number; revenue: number | null };

/* Mirrors paymentBadge() in lib/bookingStatus — see the note above. */
const PAYMENT: Record<string, { label: string; tone: 'info' | 'success' | 'warn' | 'danger' }> = {
  paid: { label: 'Paid', tone: 'success' },
  refunded: { label: 'Refunded', tone: 'info' },
  partial: { label: 'Partially Refunded', tone: 'info' },
  pending: { label: 'Unpaid', tone: 'danger' },
};
const paymentBadge = (s: string) => PAYMENT[s] ?? { label: s, tone: 'info' as const };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

const TXNS: Txn[] = [
  { id: '1', booking_number: 1885, scheduled_at: '2026-08-16', customer_name: 'Bill Ohlsen', service_name: 'Deep Clean', gross_amount: 100, processing_fee: 3.2, net_amount: 96.8, cleaner_pay: 60, payment_status: 'paid' },
  { id: '2', booking_number: 2011, scheduled_at: '2026-08-21', customer_name: 'Daniel Mrusko', service_name: 'Standard Clean', gross_amount: 112.5, processing_fee: 3.56, net_amount: 108.94, cleaner_pay: 67.5, payment_status: 'paid' },
  { id: '3', booking_number: 1994, scheduled_at: '2026-08-14', customer_name: 'Marcus Hall', service_name: 'Standard Clean', gross_amount: 125, processing_fee: 3.93, net_amount: 121.07, cleaner_pay: 75, payment_status: 'refunded' },
  { id: '4', booking_number: 2002, scheduled_at: '2026-08-27', customer_name: 'Priya Nair', service_name: 'Deep Clean', gross_amount: 210, processing_fee: 6.39, net_amount: 203.61, cleaner_pay: 126, payment_status: 'partial' },
  { id: '5', booking_number: 2018, scheduled_at: '2026-08-19', customer_name: 'Brandy Lee', service_name: 'Move-Out Clean', gross_amount: 340, processing_fee: 0, net_amount: 340, cleaner_pay: 204, payment_status: 'pending' },
  /* Figures did not load — never a chain of zeroes. */
  { id: '6', booking_number: 2044, scheduled_at: '2026-08-22', customer_name: 'Sarah Mahoney', service_name: 'Standard Clean', gross_amount: null, processing_fee: null, net_amount: null, cleaner_pay: null, payment_status: 'paid' },
];

const TAX: TaxRow[] = [
  { zip: '33138', transactions: 14, revenue: 1840 },
  { zip: '33305', transactions: 9, revenue: 2260 },
  { zip: '33181', transactions: 22, revenue: 3410 },
  { zip: '33004', transactions: 5, revenue: 610 },
];

const TABS: { id: Tab; label: string; count?: number }[] = [
  { id: 'transactions', label: 'Transactions', count: TXNS.length },
  { id: 'sales-tax', label: 'Sales tax', count: TAX.length },
];

const STATES: { id: ListState; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Six transactions. Gross is the headline; the deductions read down in the order they happen.' },
  { id: 'loading', label: 'Loading', why: 'Skeleton rows rather than a ledger of zeroes.' },
  { id: 'empty', label: 'Empty', why: 'No transactions in this period.' },
  { id: 'error', label: 'Error', why: 'No figures render at all — a chain of zeroes would read as a free job with an unpaid cleaner.' },
];

export default function FinancePreviewPage() {
  const [state, setState] = useState<ListState>('ready');
  const [tab, setTab] = useState<Tab>('transactions');
  const [search, setSearch] = useState('');
  const [testMode, setTestMode] = useState(false);

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  /* Each column keeps its own mask shape, and the shapes carry magnitude —
     a fee is a small number and '-$X.XX' says so. */
  const mGross = (n: number | null) => (n === null ? '—' : testMode ? '$XXX.XX' : fmt(n));
  const mFee = (n: number | null) => (n === null ? '—' : testMode ? '-$X.XX' : `-${fmt(n)}`);
  const mNet = (n: number | null) => (n === null ? '—' : testMode ? '$XXX.XX' : fmt(n));
  const mPay = (n: number | null) => (n === null ? '—' : testMode ? '$XX.XX' : fmt(n));

  const q = search.trim().toLowerCase();
  const txns = TXNS.filter(
    t => !q || t.customer_name.toLowerCase().includes(q) || String(t.booking_number).includes(q) || t.service_name.toLowerCase().includes(q),
  );
  const tax = TAX.filter(t => !q || t.zip.includes(q));
  const count = tab === 'transactions' ? txns.length : tax.length;
  const effective: ListState = state === 'ready' && count === 0 ? 'empty' : state;

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
        <button
          type="button"
          onClick={() => setTestMode(v => !v)}
          className={
            'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
            (testMode
              ? 'bg-[hsl(var(--pv-gold))] text-[hsl(var(--pv-gold-ink))]'
              : 'bg-[hsl(var(--pv-card))] text-[hsl(var(--pv-ink-2))]')
          }
        >
          Test mode {testMode ? 'on' : 'off'}
        </button>
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {testMode
            ? "Masks carry magnitude: '$XXX.XX' gross, '-$X.XX' fee, '$XX.XX' cleaner pay."
            : STATES.find(s => s.id === state)?.why}
        </p>
      </div>

      {/* .portal-v2 carries the --pv-* custom properties. Without it the
          tokens do not resolve and every colour silently falls back to an
          inherited value — which looked plausible against the dark shell,
          which is why it went unnoticed. */}
      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <ListShell<Tab>
          title="Finance"
          action={{ label: 'Export' }}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by customer, booking #, or zip..."
          tabs={TABS}
          tab={tab}
          onTab={setTab}
          state={effective}
          empty={
            q
              ? { title: 'Nothing matches that', hint: 'Try a booking number, a customer, or a zip code.', action: { label: 'Clear search', onClick: () => setSearch('') } }
              : { title: 'No transactions in this period', hint: 'Completed, paid bookings will show here.' }
          }
          errorLabel="Couldn't load finance"
          onRetry={() => setState('ready')}
          skeletonRows={6}
        >
          {tab === 'transactions' ? (
            <>
              <ListSectionLabel>{txns.length} transactions</ListSectionLabel>
              {txns.map(t => {
                const noFigures = t.gross_amount === null;
                return (
                  <ListRow
                    key={t.id}
                    lead={{ kind: 'ref', label: `#${t.booking_number}` }}
                    title={t.customer_name}
                    meta={t.service_name}
                    lines={
                      noFigures
                        ? [longDate(t.scheduled_at), 'Figures unavailable']
                        : [
                            /* Date on its own line: paired with the service name
                               it truncated on the longest row ("Deep Clean · Aug
                               27, 2026"). Fifth time this batch. */
                            longDate(t.scheduled_at),
                            /* The chain, in the order it happens. Each on its
                               own line — pairing truncates the second, which
                               this batch has now proved four times over. */
                            `Fee ${mFee(t.processing_fee)}`,
                            `Net ${mNet(t.net_amount)}`,
                            `Cleaner pay ${mPay(t.cleaner_pay)}`,
                          ]
                    }
                    money={mGross(t.gross_amount)}
                    status={[paymentBadge(t.payment_status)]}
                    onClick={() => undefined}
                  />
                );
              })}
            </>
          ) : (
            <>
              <ListSectionLabel>{tax.length} zip codes</ListSectionLabel>
              {tax.map(t => (
                <ListRow
                  key={t.zip}
                  title={t.zip}
                  meta={`${t.transactions} transactions`}
                  money={t.revenue === null ? '—' : testMode ? '$X,XXX' : fmt(t.revenue)}
                  onClick={() => undefined}
                />
              ))}
            </>
          )}
        </ListShell>
      </div>
    </div>
  );
}
