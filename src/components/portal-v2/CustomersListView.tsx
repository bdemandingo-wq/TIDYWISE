import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { ListShell, ListSectionLabel, type ListState } from './ListShell';
import { ActionChipRow, type ActionChip } from './ActionChipRow';
import { PersonRow, PersonRowMenu } from './PersonRow';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Edit, DollarSign, MessageSquare, Trash2 } from 'lucide-react';
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
  actions,
  onAdd,
  header,
  onMerge,
  typeTab,
  onTypeTab,
  customerCount,
  leadCount,
  onRowAction,
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
  /* Import / Export / Merge — the live screen's toolbar, which the comp
     has no room for and which the swap would otherwise have deleted. */
  actions?: ActionChip[];
  /** Wires the comp's "+ Add" header button to the real dialog. */
  onAdd?: () => void;
  /* Comp 7g's "⇅ Merge" control beside the search box. Opens the app's real
     duplicate-merge flow (e.g. /dashboard/customers/duplicates). Optional —
     the states preview and any caller without a merge flow render unchanged. */
  onMerge?: () => void;
  /* Comp 7g's All / Customers / Leads pill row under the stat wells. All
     four are optional together: passing none keeps today's single
     "All customers" tab. `rows` is already the caller's list — status
     itself resolves 'lead' vs everything else, so the counts are supplied
     rather than recomputed here from a narrower type. */
  typeTab?: 'all' | 'customer' | 'lead';
  onTypeTab?: (t: 'all' | 'customer' | 'lead') => void;
  customerCount?: number;
  leadCount?: number;
  /** The kebab on each row — same four actions the desktop icon row offers.
      Optional: omitted callers (e.g. the states preview) get no kebab, not a
      dead one. */
  onRowAction?: (row: CustomersRow, action: 'edit' | 'payment' | 'message' | 'delete') => void;
  /* ── Comp header slot ──────────────────────────────────────────────────
     7g, 8g and 8a all open with a dark InverseHeader carrying the screen's
     headline figure and its stat wells. It is page chrome, not list content,
     so it renders BEFORE the shell and is unaffected by list state — an
     empty list still shows the totals above it.

     Optional, so the states previews and any caller that does not want one
     are unchanged. */
  header?: ReactNode;
}) {
  const filtered = search.trim().length > 0;

  return (
    <>
      {header}
      {/* Outside ListShell on purpose — the shell renders children only when
          state === 'ready', so a chip row inside it vanishes on an empty,
          loading or failed list, taking the actions with it. */}
      {actions && actions.length > 0 && (
        <div className="px-5 pb-1.5 pt-1">
          <ActionChipRow actions={actions} label="Customer actions" />
        </div>
      )}

    <ListShell<'all' | 'customer' | 'lead'>
      title="Customers"
      action={{ label: 'Add', onClick: onAdd }}
      search={search}
      onSearch={onSearch}
      searchPlaceholder="Search by name, email, or phone..."
      merge={onMerge ? { onClick: onMerge } : undefined}
      tabs={
        onTypeTab
          ? [
              { id: 'all', label: 'All', count: (customerCount ?? 0) + (leadCount ?? 0) },
              { id: 'customer', label: 'Customers', count: customerCount ?? 0 },
              { id: 'lead', label: 'Leads', count: leadCount ?? 0 },
            ]
          : [{ id: 'all', label: 'All customers', count: rows.length }]
      }
      tab={onTypeTab ? typeTab ?? 'all' : 'all'}
      onTab={onTypeTab ?? (() => undefined)}
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
              action: { label: 'Add customer', onClick: onAdd },
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

      {/* PersonRow, not ListRow — the 7h/10g comps use it for people and it
          carries what a person's row needs that a generic one does not: an
          avatar keyed off the name, an `inactive` treatment that dims the whole
          row rather than adding a pill, and a `state="error"` that keeps the
          row present when its data failed.

          That last one matters here. PersonRow's own docstring warns that a
          failed read must never fall back to `inactive`, because a greyed-out
          dashed row says "this person is deactivated" — a claim. An inactive
          CUSTOMER is a real state on this screen (getEffectiveStatus resolves
          it), so the two have to stay separate, and they do. */}
      {rows.map(r => (
        <PersonRow
          key={r.id}
          name={r.name ?? 'Unnamed customer'}
          /* Short scannable values belong in facts; the email, phone and
             address get their own lines because at 390px three of them in one
             wrap row read as a run-on string. */
          facts={[
            r.bookings === undefined
              ? 'History unavailable'
              : r.bookings === 0
                ? 'No bookings'
                : `${r.bookings} booking${r.bookings === 1 ? '' : 's'}`,
            /* §5.1: undefined spend renders NOTHING, never $0.00 — a customer
               who has spent nothing and one whose spend did not read must not
               look identical. */
            ...(r.revenue === undefined ? [] : [`$${r.revenue.toFixed(2)}`]),
            ...(r.lastBookingLabel ? [`last ${r.lastBookingLabel}`] : []),
          ]}
          lines={[
            /* Six of eight live customers share a name. The email is what
               actually identifies a row, so it is never dropped. */
            r.email ?? 'No email',
            r.phone ?? 'No phone',
            /* Absent on 3 of 8 live customers as an EMPTY STRING rather than
               null — the caller passes null and this says so. */
            r.location ?? 'No address on file',
          ]}
          /* A customer explicitly marked inactive gets the dimmed treatment —
             this is the real state, not a failure. */
          inactive={r.status === 'inactive'}
          badges={[
            customerStatusBadge(r.status),
            ...(r.is_recurring
              ? [{ tone: 'info' as const, label: 'Recurring' }]
              : []),
          ]}
          onClick={onSelect ? () => onSelect(r) : undefined}
          actions={
            onRowAction ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <PersonRowMenu label={`More actions: ${r.name ?? 'customer'}`} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="gap-2" onClick={() => onRowAction(r, 'edit')}>
                    <Edit className="h-3.5 w-3.5" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onClick={() => onRowAction(r, 'payment')}>
                    <DollarSign className="h-3.5 w-3.5" /> Payment History
                  </DropdownMenuItem>
                  {r.phone && (
                    <DropdownMenuItem className="gap-2" onClick={() => onRowAction(r, 'message')}>
                      <MessageSquare className="h-3.5 w-3.5" /> Send Message
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="gap-2 text-destructive focus:text-destructive"
                    onClick={() => onRowAction(r, 'delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : undefined
          }
        />
      ))}
    </ListShell>
    </>
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
