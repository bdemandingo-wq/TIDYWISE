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
