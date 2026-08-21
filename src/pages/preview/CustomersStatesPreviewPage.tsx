import { useState } from 'react';
import { CustomersListView, type CustomersRow } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * Every state of the SAME CustomersListView that /dashboard/customers-v2
 * renders from live data.
 *
 * Rows are shaped from what the live table actually holds:
 *
 *   - Six of eight live customers share a name, so two rows here do too. The
 *     email is what tells them apart, which is why it is never dropped.
 *   - Names in the live table carry trailing whitespace ("apple  client",
 *     "Joe  anino" both render a double space from `${first} ${last}`), so one
 *     row proves customerDisplayName collapses it.
 *   - Address/city/zip are EMPTY STRING on 3 of 8, never null, so one row has
 *     no location.
 *   - customer_status holds raw slugs. Every row goes through
 *     customerStatusBadge, so 'active' reads "Customer".
 *   - "Stats unread" is its own state, distinct from zero bookings.
 */

const ROWS: CustomersRow[] = [
  {
    id: '1', name: 'Emmanuel forkuoh', email: 'agencyfootprintllc@gmail.com',
    phone: '(305) 555-0142', location: 'Deerfield Beach, FL',
    status: 'active', is_recurring: true,
    bookings: 12, revenue: 3140, lastBookingLabel: 'Aug 19',
  },
  {
    /* Same name, different person. Only the email separates them. */
    id: '2', name: 'Emmanuel forkuoh', email: 'vitalnestinc@gmail.com',
    phone: '(305) 555-0177', location: 'Deerfield Beach, FL',
    status: 'active', is_recurring: false,
    bookings: 3, revenue: 690, lastBookingLabel: 'Jul 28',
  },
  {
    /* Collapsed from "apple " + " client" — the live table really does this. */
    id: '3', name: 'apple client', email: 'appleclient@tidywise.com',
    phone: '(305) 555-0190',
    /* Empty string in the table, passed as null. */
    location: null,
    status: 'lead', is_recurring: false,
    bookings: 0, revenue: 0, lastBookingLabel: null,
  },
  {
    /* Explicitly marked inactive despite having history. This is the case the
       old ordering got wrong — stats used to override the human. */
    id: '4', name: 'Joe anino', email: 'joe.anino@gmail.com',
    phone: '(786) 555-0110', location: 'Miami, FL',
    status: 'inactive', is_recurring: false,
    bookings: 7, revenue: 1820, lastBookingLabel: 'Mar 2',
  },
  {
    /* Stats unread for this row: no count, and NO money at all — not $0.00. */
    id: '5', name: null, email: null, phone: null, location: null,
    status: 'lead', is_recurring: false,
    bookings: undefined, revenue: undefined, lastBookingLabel: null,
  },
];

const STATES: { id: ListState | 'no-stats'; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'Two customers share a name — email is the only thing separating them. One has no address (empty string in the table, not null). One is explicitly Inactive despite 7 bookings: the human beats the history.' },
  { id: 'no-stats', label: 'Stats failed', why: 'Customers loaded, booking history did not. Said once at the top rather than every row claiming zero bookings — which would read as a list of people who never booked. Money renders nothing, never $0.00.' },
  { id: 'loading', label: 'Loading', why: 'Skeletons.' },
  { id: 'empty', label: 'Empty', why: 'An org with no customers. Distinct from a failed read.' },
  { id: 'error', label: 'Error / offline', why: 'The live screen cannot reach this: a paused query reports isLoading false, error null, data [] and falls through to "No customers yet".' },
];

export default function CustomersStatesPreviewPage() {
  const [state, setState] = useState<ListState | 'no-stats'>('ready');
  const [search, setSearch] = useState('');

  const showRows = state === 'ready' || state === 'no-stats';
  const rows: CustomersRow[] = showRows
    ? state === 'no-stats'
      ? ROWS.map(r => ({ ...r, bookings: undefined, revenue: undefined, lastBookingLabel: null }))
      : ROWS
    : [];

  const phase: ListState = state === 'no-stats' ? 'ready' : state;

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
              'rounded-full px-3 py-1 text-[11px] font-bold ' +
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

      <div className="portal-v2 mx-auto w-full max-w-[430px] bg-[hsl(var(--pv-bg))]">
        <CustomersListView
          phase={phase}
          rows={rows}
          search={search}
          onSearch={setSearch}
          statsUnavailable={state === 'no-stats'}
          onRetry={() => setState('ready')}
        />
      </div>
    </div>
  );
}
