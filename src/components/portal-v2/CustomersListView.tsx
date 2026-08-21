import { useMemo } from 'react';
import { ListShell, ListSectionLabel, type ListState } from './ListShell';
import { ListRow } from './ListRow';
import { customerStatusBadge } from '@/lib/customerStatus';

/**
 * The admin customers list, presentation only. No queries.
 *
 * Sibling of BookingsListView; same split so the states stay renderable from
 * fabricated props at /dashboard/preview/customers-states.
 */

export type CustomersRow = {
  id: string;
  /** Already collapsed by customerDisplayName — never a raw template join. */
  name: string | null;
  email: string | null;
  phone: string | null;
  /** Falsy when absent. customers.* uses EMPTY STRING, not null. */
  location: string | null;
  /** Pre-resolved by effectiveCustomerStatus, never the raw column. */
  status: string;
  is_recurring: boolean;
  /** Undefined = stats unread. Not the same as zero. */
  bookings?: number;
  revenue?: number;
  lastBookingLabel?: string | null;
};

export function CustomersListView({
  phase,
  rows,
  search,
  onSearch,
  onSelect,
  onRetry,
  sectionLabel,
  statsUnavailable,
}: {
  phase: ListState;
  rows: CustomersRow[];
  search: string;
  onSearch: (v: string) => void;
  onSelect?: (r: CustomersRow) => void;
  onRetry?: () => void;
  sectionLabel?: string;
  /** True when the booking-stats read failed but customers loaded. */
  statsUnavailable?: boolean;
}) {
  const filtered = search.trim().length > 0;

  return (
    <ListShell<'all'>
      title="Customers"
      action={{ label: 'Add' }}
      search={search}
      onSearch={onSearch}
      searchPlaceholder="Search by name, email, or phone..."
      tabs={[{ id: 'all', label: 'All customers', count: rows.length }]}
      tab="all"
      onTab={() => undefined}
      state={phase}
      empty={
        filtered
          ? {
              title: 'Nobody matches that',
              hint: 'Try another name, email, or phone number.',
              action: { label: 'Clear search', onClick: () => onSearch('') },
            }
          : {
              title: 'No customers yet',
              hint: 'People who book, and ones you add by hand, will show here.',
              action: { label: 'Add customer' },
            }
      }
      errorLabel="Couldn't load customers"
      onRetry={onRetry}
      skeletonRows={6}
    >
      <ListSectionLabel>{sectionLabel ?? `${rows.length} customers`}</ListSectionLabel>

      {/* Customers loaded but their booking history did not. Said once, at the
          top, rather than making every row claim zero bookings — which would
          read as a list of people who have never booked. */}
      {statsUnavailable && (
        <p className="mx-4 mb-2 rounded-[10px] bg-[hsl(var(--pv-warn-soft))] px-3.5 py-2.5 text-[11.5px] font-semibold leading-[1.45] text-[hsl(var(--pv-ink-2))]">
          Booking history didn&rsquo;t load, so spend and visit counts aren&rsquo;t
          shown. The list itself is complete.
        </p>
      )}

      {rows.map(r => (
        <ListRow
          key={r.id}
          /* Six of eight live customers share a name. The email is what
             actually identifies a row, so it is never dropped. */
          title={r.name ?? 'Unnamed customer'}
          meta={r.email ?? 'No email'}
          lines={[
            r.phone ?? 'No phone',
            /* Absent on 3 of 8 live customers, as an EMPTY STRING rather than
               null — so the caller passes null and this says so. */
            r.location ?? 'No address on file',
            r.bookings === undefined
              ? 'History unavailable'
              : r.bookings === 0
                ? 'No bookings yet'
                : `${r.bookings} booking${r.bookings === 1 ? '' : 's'}${r.lastBookingLabel ? ` · last ${r.lastBookingLabel}` : ''}`,
          ]}
          /* §5.1: undefined revenue renders nothing at all, never $0.00 — a
             customer who has spent nothing and a customer whose spend did not
             read must not look identical. */
          money={
            r.revenue === undefined
              ? undefined
              : `$${r.revenue.toFixed(2)}`
          }
          status={[
            customerStatusBadge(r.status),
            ...(r.is_recurring
              ? [{ tone: 'info' as const, label: 'Recurring' }]
              : []),
          ]}
          onClick={onSelect ? () => onSelect(r) : undefined}
        />
      ))}
    </ListShell>
  );
}

export function matchesCustomerSearch(r: CustomersRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    (r.name ?? '').toLowerCase().includes(s) ||
    (r.email ?? '').toLowerCase().includes(s) ||
    (r.phone ?? '').toLowerCase().includes(s)
  );
}

export function useCustomerSearch(all: CustomersRow[], search: string) {
  return useMemo(() => all.filter(r => matchesCustomerSearch(r, search)), [all, search]);
}
