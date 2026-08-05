/**
 * What a booking actually earned the organisation.
 *
 * A refunded job earned nothing — the money went back to the customer. It is
 * not dropped from the row set, because the job did happen: the cleaner was
 * paid and Stripe kept its processing fee, so it still belongs in booking
 * counts and in any cost figure. It contributes zero to revenue and no more.
 *
 * This mirrors PnLCalendar, which has resolved refunds this way since it was
 * written (see its `isRefunded` handling). Reports had no concept of a refund
 * anywhere in its filters and counted the full amount, which is how July 2026
 * read $383 above the P&L for TIDYWISE.
 *
 * Keeping it in one place is the point of the file. Three surfaces each
 * summing `total_amount` their own slightly different way is what produced
 * that discrepancy; a shared function is what stops it recurring.
 */
export interface RevenueBooking {
  total_amount?: number | string | null;
  payment_status?: string | null;
}

export function bookingRevenue(booking: RevenueBooking): number {
  if (booking.payment_status === 'refunded') return 0;
  return Number(booking.total_amount || 0);
}

/** Sum of {@link bookingRevenue} across a list. */
export function sumBookingRevenue(bookings: RevenueBooking[]): number {
  return bookings.reduce((sum, b) => sum + bookingRevenue(b), 0);
}
