/**
 * Customer status: what it is, and what to call it.
 *
 * Sibling of bookingStatus.ts, and it exists for the same reason — the values
 * in `customers.customer_status` are SLUGS ('lead', 'active', 'inactive'),
 * confirmed against the live table, and nothing in src/lib mapped them to
 * labels before this file. Rendering the column directly prints "lead".
 */

export type CustomerStatus = 'active' | 'lead' | 'inactive';
type Tone = 'success' | 'info' | 'warn' | 'danger';

export interface CustomerBookingStats {
  total_bookings: number;
  total_revenue: number;
}

/**
 * The effective status, mirroring getEffectiveStatus() in CustomersPage.
 *
 * ORDER MATTERS, and getting it wrong is a bug this project has already
 * shipped once. An explicitly-set status wins over anything derived: if a
 * human marked someone inactive, booking history does not get to disagree.
 * The earlier version checked history first, so "mark inactive" silently did
 * nothing for any customer who had ever booked — which is every customer
 * worth marking inactive.
 *
 * 'lead' is the DEFAULT the column ships with, so it may simply be stale.
 * That is the only case where history is allowed to override.
 *
 * `stats` is deliberately `undefined`-able and that is not the same as zero.
 * Undefined means the stats read returned nothing for this customer — either
 * it failed or it has not arrived — and in that case a 'lead' stays a 'lead'
 * rather than being promoted or demoted on missing evidence.
 */
export function effectiveCustomerStatus(
  customerStatus: string | null | undefined,
  stats?: CustomerBookingStats,
): CustomerStatus {
  if (customerStatus === 'inactive') return 'inactive';
  if (customerStatus === 'active') return 'active';

  if (stats && (stats.total_bookings > 0 || stats.total_revenue > 0)) {
    return 'active';
  }
  return (customerStatus as CustomerStatus) || 'lead';
}

/**
 * 'active' reads "Customer", not "Active" — the live screen's own vocabulary.
 * The distinction the list is organised around is customer-versus-lead, and
 * "Active" invites the reader to look for an "Inactive" opposite that means
 * something different from what this column tracks.
 */
export function customerStatusBadge(s: string): { label: string; tone: Tone } {
  if (s === 'active') return { label: 'Customer', tone: 'success' };
  if (s === 'inactive') return { label: 'Inactive', tone: 'info' };
  if (s === 'lead') return { label: 'Lead', tone: 'warn' };
  /* Any value outside the three is shown as-is rather than guessed at, the
     same fallback adminBookingStatusBadge uses. */
  return { label: s, tone: 'info' };
}

/**
 * A display name from first/last.
 *
 * Not a template literal, because the live table contains names with trailing
 * whitespace — "apple  client" and "Joe  anino" both render with a double
 * space from `${first} ${last}`. Collapsed here so every caller gets it right
 * rather than each one rediscovering it.
 */
export function customerDisplayName(
  first: string | null | undefined,
  last: string | null | undefined,
): string | null {
  const n = `${first ?? ''} ${last ?? ''}`.replace(/\s+/g, ' ').trim();
  return n || null;
}
