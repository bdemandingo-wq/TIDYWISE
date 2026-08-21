import { useState } from 'react';
import { BookingsListView, type BookingsRow } from '@/components/portal-v2';
import type { ListState } from '@/components/portal-v2';

/**
 * Every state of the SAME BookingsListView that /dashboard/bookings-v2
 * renders from live data.
 *
 * Preview route only. This exists because the states worth checking are the
 * ones that are hard to produce on demand against a real org: a failed read,
 * offline with nothing cached, and an org with no bookings at all. Sibling of
 * JobDetailStatesPreviewPage, same reasoning.
 *
 * The rows below are shaped from what the live org ACTUALLY contains rather
 * than from tidy invented data:
 *
 *   - 13% of live bookings have no assigned staff, so one row is Unassigned.
 *   - A booking really is priced at $2.00. Real data has values that look
 *     like mistakes and are not.
 *   - A team booking, because booking_team_assignments returns MANY rows and
 *     the display is the only place the whole team is visible — the live SMS
 *     path reads only the primary.
 *   - A row with no customer at all, because the customer join is nullable.
 */

const ROWS: BookingsRow[] = [
  {
    id: '1', booking_number: 239, customer: 'Emmanuel forkuoh',
    customer_email: 'agencyfootprintllc@gmail.com', service_name: 'Airbnb Turnover',
    total_amount: 260, scheduled_label: 'Thu, Jan 22, 1:00 AM',
    status: 'confirmed', payment_status: null, staff_name: null, team: [],
  },
  {
    id: '2', booking_number: 248, customer: 'Emmanuel forkuoh',
    customer_email: 'agencyfootprintllc@gmail.com', service_name: 'Airbnb Turnover',
    /* Real. Not a placeholder. */
    total_amount: 2, scheduled_label: 'Sun, Jan 25, 1:30 AM',
    status: 'pending', payment_status: null, staff_name: 'john smith', team: ['john smith'],
  },
  {
    id: '3', booking_number: 1102, customer: 'Joe anino',
    customer_email: 'joe.anino@gmail.com', service_name: 'Deep Clean',
    total_amount: 530, scheduled_label: 'Wed, Aug 19, 9:00 AM',
    status: 'confirmed', payment_status: 'paid', has_payment_intent: true,
    staff_name: 'Emmanuel forkuoh',
    /* Three assignees. The live notify path would message only the first. */
    team: ['Emmanuel forkuoh', 'john smith', 'Laura Gomez'],
  },
  {
    id: '4', booking_number: 1141, customer: null,
    customer_email: null, service_name: 'Post Construction Clean',
    total_amount: 350, scheduled_label: 'Fri, Aug 21, 11:00 AM',
    status: 'completed', payment_status: 'paid', staff_name: 'Laura Gomez',
    team: ['Laura Gomez'], reminder: 'urgent',
  },
  {
    id: '5', booking_number: 1150, customer: 'apple client',
    customer_email: 'appleclient@tidywise.com', service_name: null,
    /* Money that did not read. Must render "—", never $0.00. */
    total_amount: null, scheduled_label: 'Sat, Aug 22, 2:00 PM',
    status: 'no_show', payment_status: 'refunded', staff_name: null, team: [],
  },
];

const STATES: { id: ListState; label: string; why: string }[] = [
  { id: 'ready', label: 'Ready', why: 'One Unassigned row, one three-person team, one null customer, one $2.00 booking that is real, and one row whose money did not read (renders "—").' },
  { id: 'loading', label: 'Loading', why: 'Skeletons, not a list of zeroes.' },
  { id: 'empty', label: 'Empty', why: 'An org with no bookings. Distinct from a read that failed.' },
  { id: 'error', label: 'Error / offline', why: 'The state the live screen cannot reach: a PAUSED query reports isLoading false, error null and data [], so BookingsPage:1925 falls through to "No bookings found" while offline. queryPhase() separates them and this branch is what the user sees instead.' },
];

export default function BookingsStatesPreviewPage() {
  const [state, setState] = useState<ListState>('ready');
  const [search, setSearch] = useState('');

  const rows = state === 'ready' ? ROWS : [];

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
        <BookingsListView
          phase={state === 'ready' && rows.length === 0 ? 'empty' : state}
          rows={rows}
          search={search}
          onSearch={setSearch}
          onRetry={() => setState('ready')}
        />
      </div>
    </div>
  );
}
