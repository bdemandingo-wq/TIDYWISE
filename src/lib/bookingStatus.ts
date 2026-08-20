/**
 * Display labels for the booking_status enum.
 *
 * The enum values are codes — `in_progress`, not "In Progress". MyJobCard has
 * carried this map inline since before portal-v2; lifting it out is what stops
 * the next screen inventing its own. StaffJobDetailPage was doing
 * `status.replace('_', ' ')`, which renders "in progress" in lower case, and
 * the 2a preview hand-wrote "Confirmed" / "Scheduled" — neither matches the
 * enum. Same class of mistake as `extras` holding slugs where a preview
 * assumed labels.
 */
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | (string & {});

type Tone = 'info' | 'success' | 'warn' | 'danger';

const MAP: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'info' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  in_progress: { label: 'In Progress', tone: 'warn' },
  completed: { label: 'Completed', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

/** Falls back to the raw code rather than guessing, so a new enum member is
 *  visible rather than silently mislabelled. */
export function bookingStatusBadge(status: string): { label: string; tone: Tone } {
  return MAP[status] ?? { label: status, tone: 'info' };
}

/**
 * Label for the job-detail action button.
 *
 * `status` is the authority, not the check-in/check-out timestamps. The live
 * My Jobs card (MyJobCard) gates every control on `booking.status`: "Start Job"
 * renders only for `confirmed`, "Complete Job" only for `in_progress`, and a
 * completed or cancelled job gets no action at all. The 3a detail view keyed
 * off `cleaner_checkin_at` / `cleaner_checkout_at` instead, so a job an admin
 * marked complete — or any job finished without GPS check-out, which is most
 * of them — rendered "Start job" on finished work.
 *
 * Timestamps still refine `confirmed`, where a cleaner has checked in but the
 * status flip has not landed yet. They never override a terminal status.
 *
 * Returns null where the live card offers nothing, so the caller hides the
 * button rather than showing a disabled control with no meaning.
 */
export function jobActionLabel(
  status: string,
  opts: { checkedIn?: boolean; checkedOut?: boolean } = {}
): string | null {
  switch (status) {
    case 'completed':
      return 'Job complete';
    case 'in_progress':
      return 'In progress';
    case 'confirmed':
      return opts.checkedOut ? 'Job complete' : opts.checkedIn ? 'In progress' : 'Start job';
    case 'pending':
      return 'Not yet confirmed';
    // cancelled, no_show, and any future member: no action on the live card.
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * Admin vocabulary
 *
 * The admin bookings screen deliberately does NOT use the labels above.
 * BookingsPage.tsx carries its own `statusLabels`, and the difference is
 * meaning, not style:
 *
 *     enum          cleaner sees     admin sees
 *     pending       "Pending"        "pending payment"
 *     confirmed     "Confirmed"      "scheduled"
 *
 * The admin list is organised around money — "pending" there means the money
 * has not landed, and an admin scanning the list is looking for exactly that.
 * Reusing bookingStatusBadge() on an admin screen would quietly relabel every
 * row and drop the distinction the screen exists to show. Two maps, on
 * purpose, each named for its audience.
 *
 * `no_show` and `rescheduled` are real members that the cleaner-facing map
 * above does not list (it falls back to the raw code, which is visible rather
 * than mislabelled). `rescheduled` is live and actionable — the job still
 * needs doing, on a new date.
 * ------------------------------------------------------------------ */

const ADMIN_MAP: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'pending payment', tone: 'warn' },
  confirmed: { label: 'scheduled', tone: 'info' },
  in_progress: { label: 'in progress', tone: 'info' },
  completed: { label: 'completed', tone: 'success' },
  cancelled: { label: 'cancelled', tone: 'danger' },
  no_show: { label: 'no show', tone: 'warn' },
  rescheduled: { label: 'rescheduled', tone: 'info' },
};

export function adminBookingStatusBadge(status: string): { label: string; tone: Tone } {
  return ADMIN_MAP[status] ?? { label: status, tone: 'info' };
}

/**
 * Payment badge, mirroring getPaymentStatusInfo() in BookingsPage.
 *
 * "Hold" is not a `payment_status` value — it is the absence of one combined
 * with a live `payment_intent_id`, i.e. an authorised card not yet captured.
 * It has to be derived, which is why this takes the flag as a second argument
 * rather than reading the column alone.
 */
export function paymentBadge(
  paymentStatus: string | null | undefined,
  hasPaymentIntent = false
): { label: string; tone: Tone } {
  if (paymentStatus === 'paid') return { label: 'Paid', tone: 'success' };
  if (paymentStatus === 'refunded') return { label: 'Refunded', tone: 'info' };
  if (paymentStatus === 'partial') return { label: 'Partially Refunded', tone: 'info' };
  if (hasPaymentIntent) return { label: 'Hold', tone: 'warn' };
  return { label: 'Unpaid', tone: 'danger' };
}

/**
 * Service name for a booking row.
 *
 * A zero-amount booking with no service row is a re-clean — work redone at no
 * charge. BookingsPage encodes this as
 * `service?.name || (total_amount === 0 ? 'Re-clean' : 'Service')`. Getting it
 * wrong labels free remedial work as a generic "Service" and hides the thing
 * an owner most wants to count.
 */
export function bookingServiceName(
  serviceName: string | null | undefined,
  totalAmount: number | null | undefined
): string {
  return serviceName || (totalAmount === 0 ? 'Re-clean' : 'Service');
}
