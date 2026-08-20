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
