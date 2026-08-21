import { useMemo, useState } from 'react';
import { ListShell, ListRow, ListSectionLabel, Card, CardTitle, Button, StatCard, SettingsRow, type ListState } from '@/components/portal-v2';

/**
 * Screen 4e — /dashboard/recurring at 390px.
 *
 * Preview route only, static data. Additive: the live RecurringBookingsPage
 * is untouched. Built from the DESKTOP table, which has nine columns.
 *
 *   Customer   CARRIED — name and email.
 *   Service    CARRIED, with the desktop's '-' fallback.
 *   Frequency  CARRIED, but LABELLED — see below.
 *   Schedule   CARRIED: DAYS_OF_WEEK[preferred_day] @ preferred_time.
 *   Amount     CARRIED, summing day_prices when present.
 *   Status     CARRIED: Active / Paused.
 *   Next Date  CARRIED on its own line.
 *   Ends       CARRIED on its own line, with "No end date" when open-ended.
 *   Actions    The kebab GIVES WAY to the row tap.
 *
 * What gives at 390px: nothing from the table. This screen is tall rather
 * than reduced — nine columns of genuinely independent facts become four
 * stacked lines plus a badge. Rows are ~5 lines each, which is the honest
 * price of not dropping anything.
 *
 * ── Recurring pattern 1: slugs where labels were assumed ──────────────
 *
 * The worst instance found so far, and it is live on the desktop table.
 * The Frequency cell ends with:
 *
 *     return booking.frequency;
 *
 * so a standard schedule renders its enum raw and lower-case — "weekly",
 * "biweekly", "triweekly", "monthly", "anyday". There is no label map for
 * them anywhere in the file.
 *
 * Worse, custom frequencies are stored as `custom_<uuid>` and resolved by
 * looking the id up in a SEPARATE query:
 *
 *     customFrequencies.find(cf => cf.id === frequency.replace('custom_',''))
 *       ?.name || booking.frequency
 *
 * The fallback is the raw value, so when that lookup misses, the Frequency
 * column shows `custom_9f3b1c2e-4a7d-…` — a UUID, in a column an owner
 * reads to know how often they are cleaning someone's house.
 *
 * That lookup misses more easily than it looks: `customFrequencies` is read
 * at line 225 as `{ data: customFrequencies = [] }` with no error handling,
 * so a failed read makes the list empty and EVERY custom row falls back to
 * its UUID at once. The same list feeds getIntervalAdder(), so the computed
 * Next Date breaks in the same failure.
 *
 * This screen labels standard frequencies properly and, when a custom one
 * cannot be resolved, says "Custom schedule" rather than printing an
 * identifier. Both are divergences from what desktop displays, neither from
 * what it means.
 *
 * ── Recurring pattern 2: single-row helpers ───────────────────────────
 *
 * None in the list read path.
 *
 * ── §5.1 ──────────────────────────────────────────────────────────────
 *
 * Fifth instance of the swallow: line 241,
 * `{ data: recurringBookings = [], isLoading }`, no `error`. A failed read
 * renders "No recurring bookings yet" to an org whose whole book is
 * recurring.
 *
 * Amount also sums `day_prices` and otherwise renders `$${total_amount}`
 * un-formatted, so a stored 180.5 prints "$180.5". Formatted properly here.
 */

type Tab = 'all' | 'active' | 'paused';

type Recurring = {
  id: string;
  customer: string;
  email: string | null;
  service_name: string | null;
  /* Raw as stored: 'weekly' | 'biweekly' | 'monthly' | 'anyday' | 'custom_<id>' */
  frequency: string;
  preferred_day: number | null;
  preferred_time: string | null;
  total_amount: number | null;
  day_prices: Record<string, number> | null;
  is_active: boolean;
  next_date: string | null;
  end_date: string | null;
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* The label map the live file does not have. */
const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  triweekly: 'Every 3 weeks',
  monthly: 'Monthly',
  anyday: 'Any day',
  custom: 'Custom schedule',
};

/* Stands in for the separate customFrequencies query. Deliberately does NOT
   contain every id the fixtures reference, so the unresolved case is visible
   rather than theoretical. */
const CUSTOM_FREQUENCIES: { id: string; name: string }[] = [
  { id: '9f3b1c2e-4a7d-4c11-8f22-0a1b2c3d4e5f', name: 'Mon & Thu' },
];

const frequencyLabel = (freq: string): string => {
  if (freq.startsWith('custom_')) {
    const id = freq.replace('custom_', '');
    const found = CUSTOM_FREQUENCIES.find(cf => cf.id === id);
    /* Never fall back to the raw value: a UUID in this column tells an owner
       nothing and looks like corruption. */
    return found?.name ?? 'Custom schedule';
  }
  return FREQUENCY_LABELS[freq] ?? freq;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

/* Mirrors the desktop rule: sum day_prices when present, else total_amount —
   but formatted, and "—" rather than a fabricated zero when neither is there. */
const amountOf = (r: Recurring): string => {
  const fromDays = r.day_prices && Object.keys(r.day_prices).length > 0
    ? Object.values(r.day_prices).reduce((a, b) => a + b, 0)
    : null;
  const value = fromDays ?? r.total_amount;
  if (value === null || value === undefined) return '—';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const scheduleOf = (r: Recurring): string => {
  if (r.preferred_day === null) return 'No preferred day';
  const day = DAYS_OF_WEEK[r.preferred_day];
  return r.preferred_time ? `${day} @ ${r.preferred_time}` : day;
};

const ROWS: Recurring[] = [
  {
    id: '1',
    customer: 'Bill Ohlsen',
    email: 'bill@crossfitwynwood.com',
    service_name: 'Deep Clean',
    frequency: 'weekly',
    preferred_day: 0,
    preferred_time: '1:00 PM',
    total_amount: 100,
    day_prices: null,
    is_active: true,
    next_date: '2026-08-23',
    end_date: null,
  },
  {
    id: '2',
    customer: 'Robert Washington',
    email: 'rwashington@bayviewhoa.com',
    service_name: 'Standard Clean',
    /* Resolves against CUSTOM_FREQUENCIES — reads "Mon & Thu". */
    frequency: 'custom_9f3b1c2e-4a7d-4c11-8f22-0a1b2c3d4e5f',
    preferred_day: 1,
    preferred_time: '11:00 AM',
    total_amount: null,
    /* Multi-day schedules price each day separately; Amount sums them. */
    day_prices: { '1': 125, '4': 180 },
    is_active: true,
    next_date: '2026-08-24',
    end_date: '2026-12-31',
  },
  {
    id: '3',
    customer: 'Sarah Mahoney',
    email: 'sarah.mahoney@gmail.com',
    service_name: 'Standard Clean',
    /* An id NOT in CUSTOM_FREQUENCIES — the live table would print this UUID
       into the Frequency column. Here it reads "Custom schedule". */
    frequency: 'custom_00000000-1111-2222-3333-444444444444',
    preferred_day: 2,
    preferred_time: '11:00 AM',
    total_amount: 95,
    day_prices: null,
    is_active: true,
    next_date: '2026-08-25',
    end_date: null,
  },
  {
    id: '4',
    customer: 'Daniel Mrusko',
    email: 'daniel.mrusko@gmail.com',
    service_name: null,
    frequency: 'biweekly',
    preferred_day: 5,
    preferred_time: '1:00 PM',
    total_amount: 112.5,
    day_prices: null,
    is_active: false,
    next_date: null,
    end_date: null,
  },
  {
    id: '5',
    customer: 'Brandy Lee',
    email: 'brandy@lee-properties.com',
    service_name: 'Move-Out Clean',
    frequency: 'monthly',
    preferred_day: null,
    preferred_time: null,
    total_amount: 340,
    day_prices: null,
    is_active: true,
    next_date: '2026-09-01',
    end_date: '2027-03-01',
  },
  {
    id: '6',
    customer: 'Priya Nair',
    email: null,
    service_name: 'Deep Clean',
    frequency: 'anyday',
    preferred_day: null,
    preferred_time: null,
    total_amount: null,
    day_prices: null,
    is_active: false,
    next_date: null,
    end_date: null,
  },
];

const TABS: { id: Tab; label: string; count?: number }[] = [
  { id: 'all', label: 'All', count: ROWS.length },
  { id: 'active', label: 'Active', count: ROWS.filter(r => r.is_active).length },
  { id: 'paused', label: 'Paused', count: ROWS.filter(r => !r.is_active).length },
];

const STATES: { id: ListState; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Six schedules. Sarah Mahoney’s custom frequency does not resolve — the live table would print its UUID here.' },
  { id: 'loading', label: 'Loading', why: 'Skeleton rows rather than an empty list.' },
  { id: 'empty', label: 'Empty', why: 'Distinguishes no schedules from a filter that matched nothing.' },
  { id: 'error', label: 'Error', why: 'The state RecurringBookingsPage does not have — today a failed read renders "No recurring bookings yet".' },
];

export default function RecurringPreviewPage() {
  const [state, setState] = useState<ListState>('ready');
  const [showAdd, setShowAdd] = useState(true);
  const [amount, setAmount] = useState('');
  const [createActive, setCreateActive] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ROWS.filter(r => {
      const matchesSearch =
        !q ||
        r.customer.toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        frequencyLabel(r.frequency).toLowerCase().includes(q);
      const matchesTab = tab === 'all' || (tab === 'active' ? r.is_active : !r.is_active);
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
        {/* 7f's summary. Paused is the number that matters: a paused schedule
            still sits in this list but generates nothing, so a bare count of
            31 would overstate what is actually running. */}
        <div className="px-4 pt-3">
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard
              label="Recurring schedules"
              value={state === 'error' ? '—' : '31'}
              caption={state === 'error' ? 'active + paused' : '18 active · 13 paused'}
            />
            <StatCard
              label="Generating visits"
              value={state === 'error' ? '—' : '18'}
              caption="the other 13 are paused"
            />
          </div>
        </div>

        {showAdd && (
          <div className="px-4 pt-3">
            <Card>
              <div className="flex items-center gap-2">
                <CardTitle>Add recurring booking</CardTitle>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="ml-auto text-[11.5px] font-bold text-[hsl(var(--pv-brand))]"
                >
                  Close
                </button>
              </div>

              {/* The comp's seven fields, in its order. */}
              <div className="mt-2">
                <SettingsRow kind="value" label="Customer *" value="Select customer" onClick={() => undefined} />
                <SettingsRow kind="value" label="Service *" value="Select service" onClick={() => undefined} />
                <SettingsRow kind="value" label="Frequency *" value="Weekly" onClick={() => undefined} />
                {/* Live stores this as ends_at (RecurringBookingsPage.tsx:500,
                    :566 stop generating past it). "Until cancelled" is the
                    null case. */}
                <SettingsRow kind="value" label="How long?" value="Until cancelled" onClick={() => undefined} />
                <SettingsRow kind="value" label="Preferred day" value="Any day" onClick={() => undefined} />
              </div>

              <div className="mt-2.5">
                <label className="block text-[11.5px] font-bold text-[hsl(var(--pv-ink-2))]">
                  Amount per visit *
                </label>
                {/* The comp pre-fills this with "0.00" as a VALUE. A required
                    money field that arrives already satisfied by a zero is how
                    you create a schedule that bills nothing — and unlike a
                    one-off, this one repeats every week until somebody notices.
                    Placeholder, not value: the field stays empty and the button
                    stays disabled until a real figure is typed. */}
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="mt-1.5 w-full rounded-[10px] bg-[hsl(var(--pv-sunken))] px-3.5 py-3 text-[13px] text-[hsl(var(--pv-ink))] outline-none placeholder:text-[hsl(var(--pv-ink-3))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-brand))]"
                />
                {!amount && (
                  <p className="mt-1 text-[11px] font-semibold text-[hsl(var(--pv-ink-3))]">
                    Every visit bills this amount, so it can&rsquo;t be left blank.
                  </p>
                )}
              </div>

              <div className="mt-2.5">
                <SettingsRow
                  kind="toggle"
                  label="Active"
                  description="Off means it saves but generates no visits."
                  checked={createActive}
                  onCheckedChange={setCreateActive}
                />
              </div>

              <div className="mt-2.5">
                {/* Button has no `disabled` prop, so the guard is the variant:
                    a secondary button that does nothing until there is a
                    figure, rather than a primary one that looks ready. */}
                <Button
                  variant={amount ? 'primary' : 'secondary'}
                  fullWidth
                  className="rounded-[12px]"
                  aria-disabled={!amount}
                  onClick={() => undefined}
                >
                  Create
                </Button>
              </div>
            </Card>
          </div>
        )}

        <ListShell<Tab>
          title="Recurring"
          action={{ label: 'New' }}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by name, email, or frequency..."
          onFilter={() => undefined}
          tabs={TABS}
          tab={tab}
          onTab={setTab}
          state={effective}
          empty={
            filtered
              ? {
                  title: 'No schedules match that',
                  hint: 'Try a different name, frequency, or tab.',
                  action: { label: 'Clear search', onClick: () => { setSearch(''); setTab('all'); } },
                }
              : {
                  title: 'No recurring bookings yet',
                  hint: 'Schedules you set up for repeat customers will show here.',
                  action: { label: 'New schedule' },
                }
          }
          errorLabel="Couldn't load recurring bookings"
          onRetry={() => setState('ready')}
          skeletonRows={6}
        >
          <ListSectionLabel>{rows.length} schedules</ListSectionLabel>
          {rows.map(r => (
            <ListRow
              key={r.id}
              lead={{ kind: 'person', name: r.customer }}
              title={r.customer}
              meta={`${r.service_name || '-'} · ${frequencyLabel(r.frequency)}`}
              /* Each on its own line. Next and Ends joined would truncate the
                 second date's year, the way Issued/Due did on invoices. */
              lines={[
                r.email ?? 'No email',
                scheduleOf(r),
                `Next ${r.next_date ? longDate(r.next_date) : '—'}`,
                r.end_date ? `Ends ${longDate(r.end_date)}` : 'No end date',
              ]}
              money={amountOf(r)}
              status={[
                r.is_active
                  ? { tone: 'success' as const, label: 'Active' }
                  : { tone: 'info' as const, label: 'Paused' },
              ]}
              onClick={() => undefined}
            />
          ))}
        </ListShell>
      </div>
    </div>
  );
}
