import { useMemo, type ReactNode } from 'react';
import { ListShell, ListSectionLabel, type ListState } from './ListShell';
import { ActionChipRow, type ActionChip } from './ActionChipRow';
import { ListRow } from './ListRow';
import {
  adminBookingStatusBadge,
  paymentBadge,
  bookingServiceName,
} from '@/lib/bookingStatus';

/**
 * The admin bookings list, presentation only.
 *
 * Split out of BookingsPreviewPage so the same component renders from real
 * data at /dashboard/bookings-v2 and from fabricated data at the preview
 * route. Same reasoning as JobDetailView: the states worth checking are the
 * ones that are hard to produce on demand — offline, a failed read, an org
 * with no bookings — and a preview route can produce all of them in one tap.
 *
 * This component owns NO queries. It takes a phase and rows.
 */

export type BookingsRow = {
  id: string;
  booking_number: number;
  customer: string | null;
  customer_email: string | null;
  service_name: string | null;
  total_amount: number | null;
  /** Pre-formatted by the caller in the ORG's timezone, never the device's. */
  scheduled_label: string;
  status: string;
  payment_status: string | null;
  has_payment_intent?: boolean;
  /** Primary assignee. Null is common — 13% of live rows have none. */
  staff_name?: string | null;
  /** Every assignee from booking_team_assignments, primary included. */
  team?: string[];
  reminder?: 'due' | 'urgent';
};

/** §5.1: a row whose money could not be read passes "—", never $0.00. */
export const bookingMoney = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `$${n.toFixed(2)}`;

/**
 * Who is going.
 *
 * `team` wins when it has more than one name, because the live SMS path reads
 * only the primary `staff` and silently leaves teammates off — the display is
 * the one place the whole team is visible, so it should not narrow to the
 * primary too.
 */
export function bookingStaffLine(r: BookingsRow): string {
  if (r.team && r.team.length > 1) return r.team.join(', ');
  return r.staff_name || 'Unassigned';
}

export function BookingsListView<T extends string = 'all'>({
  phase,
  rows,
  search,
  onSearch,
  onSelect,
  onRetry,
  sectionLabel,
  tabs,
  tab,
  onTab,
  summary,
  actions,
  onFilter,
  filterCount,
  children,
}: {
  phase: ListState;
  rows: BookingsRow[];
  search: string;
  onSearch: (v: string) => void;
  onSelect?: (r: BookingsRow) => void;
  onRetry?: () => void;
  /** Overridable so a wired caller can say "46 bookings" vs "3 matching". */
  sectionLabel?: string;
  /* ── Added when the wiring pass met the 4c mockup ──────────────────────
     The row was already comp-matched — it was extracted from the 4c preview
     and renders the identical ListRow. What the extracted view dropped was
     the SCREEN chrome: 4c's four tabs and the 2x2 summary grid between the
     tabs and the list. These props put it back without touching the row.

     Optional throughout, so the states preview keeps rendering a plain
     single-tab list and only the wired caller opts in. */
  tabs?: { id: T; label: string; count?: number }[];
  tab?: T;
  onTab?: (t: T) => void;
  /** 4c's summary cards. Rendered between the tabs and the section label. */
  summary?: ReactNode;
  /* ── Added when the toolbar moved off the live page ────────────────────
     The comp gives this screen one action. The live Bookings screen has
     five, and they used to sit in desktop chrome that also rendered on
     phones. They render here now so the swap does not delete them. */
  actions?: ActionChip[];
  /** Date-range / status filters, surfaced through ListShell's filter button. */
  onFilter?: () => void;
  filterCount?: number;
  /** Content for a tab that is not the booking list (drafts, quotes, wages). */
  children?: ReactNode;
}) {
  const filtered = search.trim().length > 0;
  const singleTab = [{ id: 'all' as T, label: 'All bookings', count: rows.length }];

  return (
    <ListShell<T>
      onFilter={onFilter}
      filterCount={filterCount ?? 0}
      title="Bookings"
      action={{ label: 'Create' }}
      search={search}
      onSearch={onSearch}
      searchPlaceholder="Search by name, service, or booking #..."
      tabs={tabs ?? singleTab}
      tab={tab ?? ('all' as T)}
      onTab={onTab ?? (() => undefined)}
      state={phase}
      empty={
        filtered
          ? {
              title: 'Nothing matches that',
              hint: 'Try another name, service, or booking number.',
              action: { label: 'Clear search', onClick: () => onSearch('') },
            }
          : {
              title: 'No bookings yet',
              hint: 'Bookings from your form, and ones you add by hand, will show here.',
              action: { label: 'Add booking' },
            }
      }
      errorLabel="Couldn't load bookings"
      onRetry={onRetry}
      skeletonRows={6}
    >
      {/* 4c puts four summary cards between the tabs and the list: a 2x2
          grid at 10px gaps. Rendered above the section label so it reads as
          a header for the whole screen rather than for the list. */}
      {summary}

      {actions && actions.length > 0 && (
        <div className="px-5 pb-1 pt-0.5">
          <ActionChipRow actions={actions} label="Booking actions" />
        </div>
      )}

      {children ?? (
        <>
      <ListSectionLabel>{sectionLabel ?? `${rows.length} bookings`}</ListSectionLabel>
      {rows.map(r => (
        <ListRow
          key={r.id}
          lead={{ kind: 'ref', label: `#${r.booking_number}` }}
          title={r.customer ?? 'Unknown'}
          meta={bookingServiceName(r.service_name, r.total_amount)}
          /* Each fact on its own line. Packing service + schedule together
             truncated the TIME away at 390px, and the time of a clean is not
             an optional detail. */
          lines={[
            r.scheduled_label,
            r.customer_email ?? 'No email',
            bookingStaffLine(r),
          ]}
          money={bookingMoney(r.total_amount)}
          status={[
            adminBookingStatusBadge(r.status),
            paymentBadge(r.payment_status, r.has_payment_intent),
            ...(r.reminder
              ? [
                  {
                    tone: r.reminder === 'urgent' ? ('danger' as const) : ('warn' as const),
                    label: r.reminder === 'urgent' ? 'Reminder overdue' : 'Reminder due',
                  },
                ]
              : []),
          ]}
          onClick={onSelect ? () => onSelect(r) : undefined}
        />
      ))}
        </>
      )}
    </ListShell>
  );
}

/** Search predicate, shared so wired and preview filter identically. */
export function matchesBookingSearch(r: BookingsRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    String(r.booking_number).includes(s) ||
    (r.customer ?? '').toLowerCase().includes(s) ||
    bookingServiceName(r.service_name, r.total_amount).toLowerCase().includes(s)
  );
}

export function useBookingSearch(all: BookingsRow[], search: string) {
  return useMemo(() => all.filter(r => matchesBookingSearch(r, search)), [all, search]);
}

