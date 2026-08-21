import { useMemo, useState } from 'react';
import { ListShell, ListRow, ListSectionLabel, type ListState } from '@/components/portal-v2';

/**
 * Screen 4g — /dashboard/payroll at 390px.
 *
 * Preview route only, static data. Additive: the live PayrollPage is
 * untouched. Built from the DESKTOP table, which has eleven columns —
 * the widest in the app — and, unlike bookings or customers, NO mobile
 * branch to fall back on. Its 436px of hidden content is a squeezed table
 * with nothing behind it.
 *
 *   Name        CARRIED — name and email.
 *   Tax Status  CARRIED as a badge. Note the value is derived, not stored
 *               as a label: `tax_classification === 'w2' ? 'W-2' : '1099'`,
 *               so anything that is not exactly 'w2' reads 1099.
 *   Cleans      CARRIED.
 *   Hours       CARRIED.
 *   Period Pay  CARRIED as the row's money. It is the headline of a payroll
 *               screen, so it gets the position money always gets.
 *   Revenue     CARRIED.
 *   Profit      CARRIED.
 *   Labor %     CARRIED, with its warning. The threshold is a real setting
 *               (labor_percent_warning_threshold, default 60) and the live
 *               table turns the figure amber above it. A colour alone does
 *               not survive being one number among five at this width, so
 *               over-threshold also raises a badge that says so.
 *   YTD         CARRIED.
 *   Status      CARRIED — Inactive, 1099 filing, Paid (Stripe/External).
 *   Actions     Mark paid / Undo payment GIVE WAY to the row tap.
 *
 * ── What gives ────────────────────────────────────────────────────────
 *
 * Six numeric columns cannot stay columns at 390px, and that is the real
 * loss: on desktop you scan Labor % down the column to find the cleaner
 * who is costing too much. Here each number needs a label, and comparison
 * becomes a scroll rather than a glance. The mitigation is that the one
 * comparison that matters — is this cleaner over the labour threshold —
 * is promoted from a colour into a badge, so it can still be found by
 * scanning.
 *
 * ── Test mode is a rendering mode, not a detail ───────────────────────
 *
 * Every figure here passes through masking, and each column masks to a
 * different SHAPE: cleans to 'X', hours to 'X.X', money to '$XXX', labour
 * to 'XX%', YTD to '$X,XXX'. That is deliberate — a masked value has to
 * stay recognisable as the kind of thing it is. Modelled here with a
 * toggle, because a row that drops its masked fields instead of showing
 * them would make a redacted figure indistinguishable from a missing one.
 * Same lesson as the redacted pay rate on PersonRow.
 *
 * ── Why a deactivated cleaner is on a payroll list ────────────────────
 *
 * The live file explains it and it would be easy to "fix" by filtering
 * them out: they have work in this period and still need paying, but they
 * are not on the current roster. So `inactive` is carried as a badge
 * rather than as a reason to hide the row.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * Money never renders zero on a failed read — a staff member whose figures
 * did not load shows "—" and a note, not $0.00, because $0.00 on a payroll
 * screen is a statement that someone is owed nothing.
 */

type Tab = 'all' | 'unpaid' | 'paid';

type StaffPay = {
  id: string;
  name: string;
  email: string | null;
  tax_classification: string;
  assignedCleans: number | null;
  totalHours: number | null;
  totalPay: number | null;
  revenueAttributed: number | null;
  profitAttributed: number | null;
  laborPercent: number | null;
  ytdEarnings: number | null;
  isInactive: boolean;
  requiresTaxFiling: boolean;
  paidVia: 'stripe_transfer' | 'external' | null;
};

/** Mirrors the live default in PayrollPage (settings.labor_percent_warning_threshold). */
const LABOR_WARNING_THRESHOLD = 60;

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ROWS: StaffPay[] = [
  {
    id: '1',
    name: 'Bruce Wayne',
    email: 'peanut2jr@icloud.com',
    tax_classification: '1099',
    assignedCleans: 12,
    totalHours: 36,
    totalPay: 1240,
    revenueAttributed: 2580,
    profitAttributed: 1340,
    laborPercent: 48,
    ytdEarnings: 18400,
    isInactive: false,
    requiresTaxFiling: true,
    paidVia: null,
  },
  {
    id: '2',
    name: 'Ana Ruiz',
    email: 'ana.ruiz@gmail.com',
    tax_classification: 'w2',
    assignedCleans: 9,
    totalHours: 27.5,
    totalPay: 962.5,
    revenueAttributed: 1320,
    profitAttributed: 357.5,
    /* Over the threshold — the one comparison the screen exists for. */
    laborPercent: 73,
    ytdEarnings: 12750,
    isInactive: false,
    requiresTaxFiling: false,
    paidVia: null,
  },
  {
    id: '3',
    name: 'Marcus Ellery',
    email: 'm.ellery@outlook.com',
    tax_classification: '1099',
    assignedCleans: 4,
    totalHours: 12,
    totalPay: 420,
    revenueAttributed: 980,
    profitAttributed: 560,
    laborPercent: 43,
    ytdEarnings: 9100,
    /* Deactivated, but worked this period and still needs paying. */
    isInactive: true,
    requiresTaxFiling: true,
    paidVia: null,
  },
  {
    id: '4',
    name: 'Sofia Marin',
    email: 'sofia.marin@gmail.com',
    tax_classification: 'w2',
    assignedCleans: 15,
    totalHours: 45,
    totalPay: 1575,
    revenueAttributed: 3450,
    profitAttributed: 1875,
    laborPercent: 46,
    ytdEarnings: 21300,
    isInactive: false,
    requiresTaxFiling: false,
    paidVia: 'stripe_transfer',
  },
  {
    id: '5',
    name: 'Devon Clarke',
    email: null,
    tax_classification: '1099',
    assignedCleans: 6,
    totalHours: 18,
    totalPay: 630,
    revenueAttributed: 1400,
    profitAttributed: 770,
    laborPercent: 45,
    ytdEarnings: 7350,
    isInactive: false,
    requiresTaxFiling: true,
    paidVia: 'external',
  },
  {
    id: '6',
    name: 'Priya Raman',
    email: 'priya.raman@gmail.com',
    tax_classification: 'w2',
    /* Figures did not load for this person. Never $0.00 — see §5.1 above. */
    assignedCleans: null,
    totalHours: null,
    totalPay: null,
    revenueAttributed: null,
    profitAttributed: null,
    laborPercent: null,
    ytdEarnings: null,
    isInactive: false,
    requiresTaxFiling: false,
    paidVia: null,
  },
];

const TABS: { id: Tab; label: string; count?: number }[] = [
  { id: 'all', label: 'All', count: ROWS.length },
  { id: 'unpaid', label: 'Unpaid', count: ROWS.filter(r => !r.paidVia).length },
  { id: 'paid', label: 'Paid', count: ROWS.filter(r => !!r.paidVia).length },
];

const STATES: { id: ListState; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Six people: one over the labour threshold, one deactivated but still owed, one whose figures did not load.' },
  { id: 'loading', label: 'Loading', why: 'Skeleton rows rather than a list of zeroes.' },
  { id: 'empty', label: 'Empty', why: 'No one worked this period — distinct from a failed read.' },
  { id: 'error', label: 'Error', why: 'No money renders at all. $0.00 on a payroll screen says someone is owed nothing.' },
];

export default function PayrollPreviewPage() {
  const [state, setState] = useState<ListState>('ready');
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [testMode, setTestMode] = useState(false);

  /* Each column masks to its own shape, mirroring the live page. A masked
     value must stay recognisable as the kind of thing it is. */
  const mCount = (n: number | null) => (n === null ? '—' : testMode ? 'X' : String(n));
  const mHours = (n: number | null) => (n === null ? '—' : testMode ? 'X.X' : n.toFixed(1));
  const mMoney = (n: number | null) => (n === null ? '—' : testMode ? '$XXX' : fmt(n));
  const mYtd = (n: number | null) => (n === null ? '—' : testMode ? '$X,XXX' : fmt(n));
  const mPct = (n: number | null) => (n === null ? '—' : testMode ? 'XX%' : `${n}%`);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ROWS.filter(r => {
      const matchesSearch = !q || r.name.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q);
      const matchesTab = tab === 'all' || (tab === 'paid' ? !!r.paidVia : !r.paidVia);
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
        <button
          type="button"
          onClick={() => setTestMode(v => !v)}
          className={
            'rounded-full px-3 py-1 text-[11px] font-bold transition-colors ' +
            (testMode
              ? 'bg-[hsl(var(--pv-gold))] text-[hsl(var(--pv-gold-ink))]'
              : 'bg-[hsl(var(--pv-surface))] text-[hsl(var(--pv-ink-2))]')
          }
        >
          Test mode {testMode ? 'on' : 'off'}
        </button>
        <p className="w-full text-[11px] text-[hsl(var(--pv-ink-3))]">
          {testMode
            ? 'Each column masks to its own shape: X cleans, X.X hours, $XXX pay, XX% labour, $X,XXX YTD.'
            : STATES.find(s => s.id === state)?.why}
        </p>
      </div>

      <div className="mx-auto w-full max-w-[430px]">
        <ListShell<Tab>
          title="Payroll"
          action={{ label: 'Export' }}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by name or email..."
          onFilter={() => undefined}
          tabs={TABS}
          tab={tab}
          onTab={setTab}
          state={effective}
          empty={
            filtered
              ? {
                  title: 'Nobody matches that',
                  hint: 'Try a different name, or another tab.',
                  action: { label: 'Clear search', onClick: () => { setSearch(''); setTab('all'); } },
                }
              : {
                  title: 'Nobody worked this period',
                  hint: 'Cleaners with assigned jobs in this pay period will show here.',
                }
          }
          errorLabel="Couldn't load payroll"
          onRetry={() => setState('ready')}
          skeletonRows={6}
        >
          <ListSectionLabel>{rows.length} on this period</ListSectionLabel>
          {rows.map(r => {
            const overThreshold =
              r.laborPercent !== null && r.laborPercent > LABOR_WARNING_THRESHOLD;
            const noFigures = r.totalPay === null;
            return (
              <ListRow
                key={r.id}
                lead={{ kind: 'person', name: r.name }}
                title={r.name}
                meta={r.email ?? 'No email'}
                lines={
                  noFigures
                    ? ['Figures unavailable for this period']
                    : [
                        /* One fact per line. Pairing them truncated the second
                           every time at this width — "Revenue $2,580.00 ·
                           Profit $1,3…" — which is the same failure bookings
                           and invoices hit. Labour is not here at all; it is a
                           badge, see below. */
                        `${mCount(r.assignedCleans)} cleans · ${mHours(r.totalHours)} hrs`,
                        `Revenue ${mMoney(r.revenueAttributed)}`,
                        `Profit ${mMoney(r.profitAttributed)}`,
                        `YTD ${mYtd(r.ytdEarnings)}`,
                      ]
                }
                money={mMoney(r.totalPay)}
                status={[
                  /* Derived, not stored: anything not exactly 'w2' is 1099. */
                  r.tax_classification === 'w2'
                    ? { tone: 'info' as const, label: 'W-2' }
                    : { tone: 'info' as const, label: '1099' },
                  /* Labour is ALWAYS a badge, not only when it breaches.
                     Desktop lets you scan the Labor % column down the list to
                     find who costs too much; badges are the only thing on this
                     row that stay in a consistent position, so putting labour
                     there is what restores that scan. Tone carries the
                     threshold — warn above it, plain below. */
                  ...(r.laborPercent !== null
                    ? [{
                        tone: overThreshold ? ('warn' as const) : ('info' as const),
                        label: `Labour ${mPct(r.laborPercent)}`,
                      }]
                    : []),
                  ...(r.isInactive ? [{ tone: 'danger' as const, label: 'Inactive' }] : []),
                  ...(r.paidVia
                    ? [{
                        tone: 'success' as const,
                        label: r.paidVia === 'stripe_transfer' ? 'Paid (Stripe)' : 'Paid (External)',
                      }]
                    : []),
                ]}
                onClick={() => undefined}
              />
            );
          })}
        </ListShell>
      </div>
    </div>
  );
}
