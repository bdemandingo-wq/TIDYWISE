// Canonical catalog of every notification type surfaced in the app.
// Each type has:
//  - key: stable identifier (used as matrix column)
//  - label: user-visible label
//  - route: destination when the notification is clicked
//  - category: grouping in Settings → Notifications
//  - sidebarKey: optional legacy sidebar-badge key it drives (for useSidebarBadges compat)
//  - managerLocked: if true, hidden for the manager role (financial-only)
//  - defaults: per-channel default when the org has not customized
//
// Channels: sidebar badge, in-app bell, browser push, native app push, email, SMS.

export type NotificationChannel =
  | 'sidebar'
  | 'bell'
  | 'browser_push'
  | 'native_push'
  | 'email'
  | 'sms';

export const CHANNELS: { key: NotificationChannel; label: string; short: string }[] = [
  { key: 'sidebar', label: 'Sidebar badge', short: 'Sidebar' },
  { key: 'bell', label: 'In-app bell', short: 'Bell' },
  { key: 'browser_push', label: 'Browser push', short: 'Browser' },
  { key: 'native_push', label: 'Native app push', short: 'Native' },
  { key: 'email', label: 'Email', short: 'Email' },
  { key: 'sms', label: 'SMS', short: 'SMS' },
];

export interface NotificationTypeDef {
  key: string;
  label: string;
  route: string;
  category: string;
  managerLocked?: boolean;
  sidebarKey?: string;
  defaults?: Partial<Record<NotificationChannel, boolean>>;
}

// Default: sidebar+bell on; browser/native/email/sms off unless flagged.
const D = (over: Partial<Record<NotificationChannel, boolean>> = {}): Partial<
  Record<NotificationChannel, boolean>
> => ({
  sidebar: true,
  bell: true,
  browser_push: false,
  native_push: false,
  email: false,
  sms: false,
  ...over,
});

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  // ── Bookings & Ops
  { key: 'booking.new', label: 'New bookings', route: '/dashboard/bookings?status=new', category: 'Bookings & Operations', sidebarKey: 'bookings.pending', defaults: D({ email: true }) },
  { key: 'booking.cancelled', label: 'Cancellations', route: '/dashboard/bookings?status=cancelled', category: 'Bookings & Operations', defaults: D({ email: true }) },
  { key: 'booking.rescheduled', label: 'Reschedules', route: '/dashboard/bookings', category: 'Bookings & Operations', defaults: D({}) },
  { key: 'booking.unassigned', label: 'Unassigned bookings', route: '/dashboard/bookings?status=unassigned', category: 'Bookings & Operations', sidebarKey: 'bookings.unassigned', defaults: D({}) },
  { key: 'booking.conflicts', label: 'Schedule conflicts', route: '/dashboard/scheduler', category: 'Bookings & Operations', sidebarKey: 'scheduler.overlaps', defaults: D({}) },
  { key: 'booking.payment_failed', label: 'Failed booking payments', route: '/dashboard/bookings?payment=failed', category: 'Bookings & Operations', sidebarKey: 'bookings.payment', defaults: D({ email: true }) },
  { key: 'booking.completed', label: 'Completed bookings', route: '/dashboard/bookings?status=completed', category: 'Bookings & Operations', defaults: D({ sidebar: false }) },
  { key: 'booking.missing_photos', label: 'Missing photos', route: '/dashboard/bookings', category: 'Bookings & Operations', defaults: D({ sidebar: false }) },
  { key: 'booking.missing_checklists', label: 'Missing checklists', route: '/dashboard/bookings', category: 'Bookings & Operations', defaults: D({ sidebar: false }) },

  // ── Staff
  { key: 'staff.time_off_request', label: 'Time-off requests', route: '/dashboard/staff?tab=time-off', category: 'Staff', sidebarKey: 'staff.time_off', defaults: D({ email: true }) },
  { key: 'staff.time_off_approved', label: 'Time-off approvals', route: '/dashboard/staff?tab=time-off', category: 'Staff', defaults: D({}) },
  { key: 'staff.missing_documents', label: 'Missing documents', route: '/dashboard/staff?tab=documents', category: 'Staff', sidebarKey: 'staff.documents', defaults: D({}) },
  { key: 'staff.payout_issue', label: 'Payout issues', route: '/dashboard/staff?tab=team', category: 'Staff', sidebarKey: 'staff.payout', managerLocked: true, defaults: D({ email: true }) },
  { key: 'staff.stripe_verification', label: 'Stripe verification issues', route: '/dashboard/payment-integration', category: 'Staff', managerLocked: true, defaults: D({ email: true }) },
  { key: 'staff.activity', label: 'Staff activity', route: '/dashboard/staff', category: 'Staff', defaults: D({ sidebar: false }) },

  // ── Client Experience
  { key: 'client.portal_request', label: 'Client portal requests', route: '/dashboard/client-portal', category: 'Client Experience', sidebarKey: 'client_portal.requests', defaults: D({ email: true }) },
  { key: 'client.message', label: 'Client messages', route: '/dashboard/messages', category: 'Client Experience', sidebarKey: 'messages.unread', defaults: D({}) },
  { key: 'client.feedback', label: 'Feedback', route: '/dashboard/feedback', category: 'Client Experience', sidebarKey: 'feedback.low_rating', defaults: D({}) },
  { key: 'client.complaint', label: 'Complaints', route: '/dashboard/feedback?filter=complaints', category: 'Client Experience', sidebarKey: 'feedback.complaint', defaults: D({ email: true }) },
  { key: 'client.low_rating', label: 'Low ratings', route: '/dashboard/feedback?filter=low', category: 'Client Experience', sidebarKey: 'feedback.low_rating', defaults: D({ email: true }) },

  // ── Leads
  { key: 'lead.new', label: 'New leads', route: '/dashboard/leads?status=new', category: 'Leads', sidebarKey: 'leads.new', defaults: D({ email: true }) },
  { key: 'lead.hot', label: 'Hot leads', route: '/dashboard/leads?filter=hot', category: 'Leads', defaults: D({ email: true }) },
  { key: 'lead.stale', label: 'Stale follow-ups', route: '/dashboard/leads?status=follow_up', category: 'Leads', sidebarKey: 'leads.stale', defaults: D({}) },
  { key: 'lead.converted', label: 'Converted leads', route: '/dashboard/leads?status=converted', category: 'Leads', defaults: D({ sidebar: false }) },
  { key: 'lead.lost', label: 'Lost leads', route: '/dashboard/leads?status=lost', category: 'Leads', defaults: D({ sidebar: false }) },

  // ── Messages & Tasks
  { key: 'messages.unread', label: 'Unread messages', route: '/dashboard/messages?filter=unread', category: 'Messages & Tasks', sidebarKey: 'messages.unread', defaults: D({}) },
  { key: 'messages.failed', label: 'Failed messages', route: '/dashboard/messages?filter=failed', category: 'Messages & Tasks', defaults: D({ email: true }) },
  { key: 'tasks.new', label: 'New tasks', route: '/dashboard/tasks', category: 'Messages & Tasks', sidebarKey: 'tasks.open', defaults: D({ sidebar: false }) },
  { key: 'tasks.overdue', label: 'Overdue tasks', route: '/dashboard/tasks?filter=overdue', category: 'Messages & Tasks', sidebarKey: 'tasks.overdue', defaults: D({}) },
  { key: 'tasks.completed', label: 'Completed tasks', route: '/dashboard/tasks?filter=completed', category: 'Messages & Tasks', defaults: D({ sidebar: false, bell: false }) },

  // ── Finance (manager-locked)
  { key: 'invoice.overdue', label: 'Overdue invoices', route: '/dashboard/invoices?filter=overdue', category: 'Finance', managerLocked: true, sidebarKey: 'payments.failed_charges', defaults: D({ email: true }) },
  { key: 'invoice.paid', label: 'Successful payments', route: '/dashboard/invoices?filter=paid', category: 'Finance', managerLocked: true, defaults: D({ sidebar: false }) },
  { key: 'invoice.failed', label: 'Failed payments', route: '/dashboard/invoices?filter=failed', category: 'Finance', managerLocked: true, sidebarKey: 'payments.failed_charges', defaults: D({ email: true }) },
  { key: 'invoice.refund', label: 'Refunds', route: '/dashboard/invoices?filter=refunded', category: 'Finance', managerLocked: true, defaults: D({}) },
  { key: 'invoice.dispute', label: 'Disputes', route: '/dashboard/invoices?filter=disputed', category: 'Finance', managerLocked: true, defaults: D({ email: true, sms: true }) },
  { key: 'stripe.disconnected', label: 'Stripe disconnected', route: '/dashboard/payment-integration', category: 'Finance', managerLocked: true, sidebarKey: 'payments.stripe_requirements', defaults: D({ email: true }) },
  { key: 'payout.issue', label: 'Payout issues', route: '/dashboard/staff?tab=team', category: 'Finance', managerLocked: true, sidebarKey: 'staff.payout', defaults: D({ email: true }) },

  // ── System
  { key: 'inventory.low', label: 'Low inventory', route: '/dashboard/inventory?filter=low', category: 'System', sidebarKey: 'inventory.low', defaults: D({}) },
  { key: 'inventory.out', label: 'Out-of-stock items', route: '/dashboard/inventory?filter=out', category: 'System', sidebarKey: 'inventory.low', defaults: D({ email: true }) },
  { key: 'automation.failed', label: 'Failed automations', route: '/dashboard/automation-center', category: 'System', sidebarKey: 'automation.failed', defaults: D({}) },
  { key: 'campaign.failed', label: 'Failed campaigns', route: '/dashboard/campaigns', category: 'System', sidebarKey: 'automation.failed', defaults: D({}) },
  { key: 'integration.disconnected', label: 'Disconnected integrations', route: '/dashboard/integrations', category: 'System', defaults: D({ email: true }) },
  { key: 'import.failed', label: 'Failed imports', route: '/dashboard/settings', category: 'System', defaults: D({ email: true }) },
];

export const CATEGORIES: string[] = Array.from(
  new Set(NOTIFICATION_TYPES.map(t => t.category))
);

export function typeByKey(key: string): NotificationTypeDef | undefined {
  return NOTIFICATION_TYPES.find(t => t.key === key);
}

/**
 * Resolve whether a specific channel should fire for a given notification type,
 * merging saved matrix over defaults. Snoozed types are treated as OFF for
 * every channel until the snooze expiry passes.
 */
export function isChannelEnabled(
  typeKey: string,
  channel: NotificationChannel,
  matrix: Record<string, Record<string, boolean>> | undefined,
  snoozed: Record<string, string> | undefined
): boolean {
  const def = typeByKey(typeKey);
  if (!def) return true;
  const snoozeIso = snoozed?.[typeKey];
  if (snoozeIso && new Date(snoozeIso).getTime() > Date.now()) return false;
  const saved = matrix?.[typeKey]?.[channel];
  if (typeof saved === 'boolean') return saved;
  return def.defaults?.[channel] ?? (channel === 'sidebar' || channel === 'bell');
}
