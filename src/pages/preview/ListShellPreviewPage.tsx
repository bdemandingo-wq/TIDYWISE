import { useState } from 'react';
import {
  BottomNav,
  CLEANER_NAV,
  ListRow,
  ListSectionLabel,
  ListShell,
  type ListState,
} from '@/components/portal-v2';

/**
 * The list shell and every ListRow shape, side by side.
 *
 * Preview route only; static data, replaces nothing live. This is the pattern
 * that ~10 admin list screens are meant to inherit — see §8 of
 * docs/mobile-design-spec.md.
 */

type Tab = 'all' | 'open' | 'done';

/* Each block is a REAL screen's row, using that screen's actual columns. */
const SAMPLES: { screen: string; note: string; rows: React.ReactNode }[] = [
  {
    screen: 'Bookings · Recurring',
    note: 'lead = date · money + status',
    rows: (
      <>
        <ListRow
          lead={{ kind: 'date', weekday: 'Sat', day: '22' }}
          title="Deep Clean · Schrank"
          meta="9:00 AM · Maria G."
          money="$240.00"
          status={{ tone: 'success', label: 'Confirmed' }}
          onClick={() => {}}
        />
        <ListRow
          lead={{ kind: 'date', weekday: 'Mon', day: '24' }}
          title="Standard Clean · Ochs"
          meta="Every 2 weeks · next Sep 7"
          money="$128.00"
          status={{ tone: 'info', label: 'Scheduled' }}
          onClick={() => {}}
        />
      </>
    ),
  },
  {
    screen: 'Invoices',
    note: 'lead = ref · money + status',
    rows: (
      <>
        <ListRow
          lead={{ kind: 'ref', label: '1042' }}
          title="Bianca Schrank"
          meta="Issued Aug 12 · due Aug 26"
          money="$240.00"
          status={{ tone: 'warn', label: 'Overdue' }}
          onClick={() => {}}
        />
        <ListRow
          lead={{ kind: 'ref', label: '1041' }}
          title="Bill Ochs"
          meta="Issued Aug 10 · paid Aug 11"
          money="$128.00"
          status={{ tone: 'success', label: 'Paid' }}
          onClick={() => {}}
        />
      </>
    ),
  },
  {
    screen: 'Expenses',
    note: 'lead = date · money, no status',
    rows: (
      <ListRow
        lead={{ kind: 'date', weekday: 'Thu', day: '20' }}
        title="Supplies · Costco"
        meta="Consumables"
        money="$84.19"
        onClick={() => {}}
      />
    ),
  },
  {
    screen: 'Leads · Feedback',
    note: 'lead = person · status, no money',
    rows: (
      <>
        <ListRow
          lead={{ kind: 'person', name: 'Dana Alvarez' }}
          title="Dana Alvarez"
          meta="Move-out · from Google · 2 days ago"
          status={{ tone: 'warn', label: 'New' }}
          onClick={() => {}}
        />
        <ListRow
          lead={{ kind: 'person', name: 'Bill Ochs' }}
          title="Bill Ochs"
          meta="Missed a spot in the kitchen · Aug 18"
          status={{ tone: 'danger', label: 'Follow up' }}
          onClick={() => {}}
        />
      </>
    ),
  },
  {
    screen: 'Tasks · Notifications',
    note: 'lead = none · status or nothing',
    rows: (
      <>
        <ListRow
          title="Call Alvarez about the gate code"
          meta="Due today"
          status={{ tone: 'danger', label: 'Overdue' }}
          onClick={() => {}}
        />
        <ListRow
          title="Payout sent to Maria G."
          meta="Aug 19 · 4:12 PM"
          onClick={() => {}}
        />
      </>
    ),
  },
  {
    screen: 'Any screen, failed read',
    note: 'money renders "—", never 0 (§5.1)',
    rows: (
      <ListRow
        lead={{ kind: 'ref', label: '1043' }}
        title="Dana Alvarez"
        meta="Issued Aug 14"
        money="—"
        onClick={() => {}}
      />
    ),
  },
];

export default function ListShellPreviewPage() {
  const [state, setState] = useState<ListState>('ready');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  return (
    <main className="portal-v2 flex min-h-dvh flex-col bg-[hsl(var(--pv-bg))]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          Shell state
        </span>
        {(['ready', 'loading', 'empty', 'error'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            aria-pressed={state === s}
            className={
              state === s
                ? 'rounded-full bg-[hsl(var(--pv-brand))] px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-brand-ink))]'
                : 'rounded-full px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-ink-3))]'
            }
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex-1 px-5 pb-6 pt-4">
        <ListShell<Tab>
          title="Bookings"
          action={{ label: 'New' }}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search bookings"
          onFilter={() => {}}
          filterCount={2}
          tabs={[
            { id: 'all', label: 'All', count: 9 },
            { id: 'open', label: 'Open', count: 4 },
            { id: 'done', label: 'Done', count: 5 },
          ]}
          tab={tab}
          onTab={setTab}
          state={state}
          empty={{
            title: 'No bookings yet',
            hint: 'New bookings will appear here as they come in.',
            action: { label: 'Add a booking' },
          }}
          errorLabel="Couldn't load bookings"
          onRetry={() => setState('ready')}
        >
          {SAMPLES.map((s) => (
            <div key={s.screen}>
              <ListSectionLabel>
                {s.screen} — {s.note}
              </ListSectionLabel>
              {s.rows}
            </div>
          ))}
        </ListShell>
      </div>

      <BottomNav items={CLEANER_NAV} active="home" />
    </main>
  );
}
