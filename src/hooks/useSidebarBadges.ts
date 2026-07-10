import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgRole } from '@/hooks/useOrgRole';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { useCleanerPayoutSetupRequired } from '@/hooks/useCleanerPayoutSetupRequired';
import { NOTIFICATION_TYPES, isChannelEnabled } from '@/lib/notificationCatalog';

/**
 * Centralized sidebar badge counts + breakdowns.
 *
 * Each nav href has:
 *   - a numeric count (sum of enabled sub-counts)
 *   - a breakdown array of {key, label, count, filter}
 *
 * Breakdowns power the sidebar hover tooltip, the on-page "Attention"
 * strip, and let the user jump to the exact filter that produced the
 * count. Individual sub-counts are gated by the organization's
 * notification preferences.
 */

export interface BadgeReason {
  key: string;
  label: string;
  count: number;
  /** Query string appended to the nav href to filter to these items. */
  filter?: string;
}

export interface SidebarBadgeData {
  counts: Record<string, number>;
  breakdowns: Record<string, BadgeReason[]>;
}

export function useSidebarBadgesFull(): SidebarBadgeData {
  const { organization } = useOrganization();
  const { hasFinancialAccess, isOwner } = useOrgRole();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const prefs = useNotificationPreferences();
  const payoutRequired = useCleanerPayoutSetupRequired(orgId);
  const showBadges = prefs.channels['channel.sidebar_badge'] !== false;
  const sb = prefs.sidebar_badges;
  // Aggregate the matrix into a "sidebar allowed" lookup by legacy sidebarKey.
  // If ANY type mapped to a given sidebarKey has sidebar channel enabled, we allow the badge.
  const sidebarAllowedByLegacyKey = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const t of NOTIFICATION_TYPES) {
      if (!t.sidebarKey) continue;
      if (t.managerLocked && !hasFinancialAccess) continue;
      const enabled = isChannelEnabled(t.key, 'sidebar', prefs.notification_matrix, prefs.snoozed_until);
      map[t.sidebarKey] = map[t.sidebarKey] || enabled;
    }
    return map;
  }, [prefs.notification_matrix, prefs.snoozed_until, hasFinancialAccess]);
  const on = (k: string) =>
    showBadges && sb[k] !== false && sidebarAllowedByLegacyKey[k] !== false;

  const enabled = !!orgId;
  const refetchInterval = 60_000;

  // ── Staff
  const { data: staff = { timeOff: 0, docs: 0, payout: 0 } } = useQuery({
    queryKey: ['sb-staff', orgId, payoutRequired],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return { timeOff: 0, docs: 0, payout: 0 };
      const [timeOff, docs, payouts] = await Promise.all([
        (supabase as any).from('time_off_requests').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'pending'),
        supabase.from('staff_documents').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'pending'),
        payoutRequired
          ? supabase.from('staff_payout_accounts').select('id, disabled_reason, requirements_currently_due').eq('organization_id', orgId)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const payout = (payouts.data || []).filter((a: any) =>
        a?.disabled_reason || (Array.isArray(a?.requirements_currently_due) && a.requirements_currently_due.length > 0)
      ).length;
      return { timeOff: timeOff.count || 0, docs: docs.count || 0, payout };
    },
  });

  // ── Bookings
  const { data: bookings = { pending: 0, unassigned: 0, payment: 0 } } = useQuery({
    queryKey: ['sb-bookings', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return { pending: 0, unassigned: 0, payment: 0 };
      const now = new Date().toISOString();
      const [pending, unassigned, failed] = await Promise.all([
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'pending').gte('scheduled_at', now),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).is('staff_id', null).neq('status', 'cancelled').gte('scheduled_at', now),
        (supabase as any).from('bookings').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('payment_status', 'failed'),
      ]);
      return { pending: pending.count || 0, unassigned: unassigned.count || 0, payment: failed.count || 0 };
    },
  });

  // ── Client Portal
  const { data: clientPortal = 0 } = useQuery({
    queryKey: ['sb-client-portal', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { count } = await supabase.from('client_booking_requests').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'pending');
      return count || 0;
    },
  });

  // ── Invoices
  const { data: invoices = { overdue: 0, failed: 0 } } = useQuery({
    queryKey: ['sb-invoices', orgId],
    enabled: enabled && hasFinancialAccess,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return { overdue: 0, failed: 0 };
      const nowIso = new Date().toISOString().slice(0, 10);
      const [overdue, failed] = await Promise.all([
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).neq('status', 'paid').neq('status', 'void').not('due_date', 'is', null).lt('due_date', nowIso),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'failed'),
      ]);
      return { overdue: overdue.count || 0, failed: failed.count || 0 };
    },
  });

  // ── Messages
  const { data: messages = { unreadConvs: 0, unreadTotal: 0 } } = useQuery({
    queryKey: ['sb-messages', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return { unreadConvs: 0, unreadTotal: 0 };
      const { data } = await supabase.from('sms_conversations').select('unread_count').eq('organization_id', orgId);
      const rows = data || [];
      const unreadConvs = rows.filter((c: any) => (c.unread_count || 0) > 0).length;
      const unreadTotal = rows.reduce((s: number, c: any) => s + (c.unread_count || 0), 0);
      return { unreadConvs, unreadTotal };
    },
  });

  // ── Tasks
  const { data: tasks = { open: 0, overdue: 0 } } = useQuery({
    queryKey: ['sb-tasks', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return { open: 0, overdue: 0 };
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('tasks_and_notes')
        .select('due_date, is_completed, type')
        .eq('organization_id', orgId)
        .in('type', ['daily', 'weekly', 'monthly'])
        .eq('is_completed', false);
      const rows = data || [];
      const overdue = rows.filter((r: any) => r.due_date && r.due_date < today).length;
      return { open: rows.length, overdue };
    },
  });

  // ── Leads (actionable = new + follow_up)
  const { data: leads = { newCount: 0, followUp: 0 } } = useQuery({
    queryKey: ['sb-leads', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return { newCount: 0, followUp: 0 };
      const [n, f] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'new'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'follow_up'),
      ]);
      return { newCount: n.count || 0, followUp: f.count || 0 };
    },
  });

  // ── Inventory
  const { data: inventory = 0 } = useQuery({
    queryKey: ['sb-inventory', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { data } = await supabase.from('inventory_items').select('quantity, min_quantity').eq('organization_id', orgId);
      return (data || []).filter((i: any) => (i.quantity ?? 0) <= (i.min_quantity ?? 0)).length;
    },
  });

  // ── Automation
  const { data: automation = 0 } = useQuery({
    queryKey: ['sb-automation', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const { count } = await supabase.from('custom_automation_logs').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'failed').gte('created_at', since);
      return count || 0;
    },
  });

  // ── Campaigns
  const { data: campaigns = 0 } = useQuery({
    queryKey: ['sb-campaigns', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const [sms, emails] = await Promise.all([
        supabase.from('campaign_sms_sends').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'failed').gte('created_at', since),
        supabase.from('campaign_emails').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'failed').gte('created_at', since),
      ]);
      return (sms.count || 0) + (emails.count || 0);
    },
  });

  // ── Payment Setup (owner only)
  const { data: payment = 0 } = useQuery({
    queryKey: ['sb-payment', orgId],
    enabled: enabled && isOwner,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { data } = await supabase.from('org_stripe_settings').select('is_connected, stripe_payouts_enabled').eq('organization_id', orgId).maybeSingle();
      if (!data) return 1;
      if (!data.is_connected) return 1;
      if (data.stripe_payouts_enabled === false) return 1;
      return 0;
    },
  });

  // ── Feedback (unresolved + follow-up-not-yet-resolved, counted separately
  //     so the sidebar always matches the on-page filter counts.)
  const { data: feedback = { unresolved: 0, followup: 0 } } = useQuery({
    queryKey: ['sb-feedback', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return { unresolved: 0, followup: 0 };
      const { data } = await supabase
        .from('client_feedback')
        .select('is_resolved, followup_needed')
        .eq('organization_id', orgId);
      const rows = data || [];
      const unresolved = rows.filter((r: any) => !r.is_resolved).length;
      // Follow-ups that still need attention (regardless of resolved flag,
      // matches the on-page "Needs Follow-up" filter which excludes resolved).
      const followup = rows.filter((r: any) => r.followup_needed && !r.is_resolved).length;
      return { unresolved, followup };
    },
  });

  // ── Realtime invalidation for every badge-driving table.
  useEffect(() => {
    if (!orgId) return;
    const inv = (key: string) => queryClient.invalidateQueries({ queryKey: [key, orgId] });
    const ch = supabase
      .channel(`sidebar-badges-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_off_requests', filter: `organization_id=eq.${orgId}` }, () => inv('sb-staff'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_documents', filter: `organization_id=eq.${orgId}` }, () => inv('sb-staff'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_payout_accounts', filter: `organization_id=eq.${orgId}` }, () => inv('sb-staff'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_booking_requests', filter: `organization_id=eq.${orgId}` }, () => inv('sb-client-portal'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `organization_id=eq.${orgId}` }, () => inv('sb-bookings'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_conversations', filter: `organization_id=eq.${orgId}` }, () => inv('sb-messages'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `organization_id=eq.${orgId}` }, () => inv('sb-leads'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_feedback', filter: `organization_id=eq.${orgId}` }, () => inv('sb-feedback'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks_and_notes', filter: `organization_id=eq.${orgId}` }, () => inv('sb-tasks'))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgId, queryClient]);

  return useMemo<SidebarBadgeData>(() => {
    const g = (n: number, key: string) => (on(key) ? n : 0);
    const push = (arr: BadgeReason[], r: BadgeReason) => { if (r.count > 0) arr.push(r); };

    // Staff
    const staffReasons: BadgeReason[] = [];
    push(staffReasons, { key: 'time_off', label: 'time-off request', count: g(staff.timeOff, 'staff.time_off'), filter: 'tab=time-off' });
    push(staffReasons, { key: 'docs', label: 'document review', count: g(staff.docs, 'staff.documents'), filter: 'tab=documents' });
    if (payoutRequired) push(staffReasons, { key: 'payout', label: 'payout issue', count: g(staff.payout, 'staff.payout'), filter: 'tab=team' });

    // Bookings
    const bookingReasons: BadgeReason[] = [];
    push(bookingReasons, { key: 'pending', label: 'pending booking', count: g(bookings.pending, 'bookings.pending'), filter: 'status=pending' });
    push(bookingReasons, { key: 'unassigned', label: 'unassigned booking', count: g(bookings.unassigned, 'bookings.unassigned'), filter: 'status=unassigned' });
    push(bookingReasons, { key: 'payment', label: 'failed payment', count: g(bookings.payment, 'bookings.payment'), filter: 'payment=failed' });

    // Scheduler shares unassigned
    const schedulerReasons: BadgeReason[] = [];
    push(schedulerReasons, { key: 'unassigned', label: 'unassigned job', count: g(bookings.unassigned, 'scheduler.overlaps') });

    // Client portal
    const portalReasons: BadgeReason[] = [];
    push(portalReasons, { key: 'requests', label: 'pending request', count: g(clientPortal, 'client_portal.requests') });

    // Invoices
    const invoiceReasons: BadgeReason[] = [];
    push(invoiceReasons, { key: 'overdue', label: 'overdue invoice', count: g(invoices.overdue, 'payments.failed_charges') });
    push(invoiceReasons, { key: 'failed', label: 'failed invoice', count: g(invoices.failed, 'payments.failed_charges') });

    // Messages
    const messageReasons: BadgeReason[] = [];
    push(messageReasons, { key: 'unread', label: 'unread conversation', count: g(messages.unreadConvs, 'messages.unread'), filter: 'filter=unread' });

    // Tasks
    const taskReasons: BadgeReason[] = [];
    push(taskReasons, { key: 'overdue', label: 'overdue task', count: g(tasks.overdue, 'tasks.overdue') });
    const openMinusOverdue = Math.max(0, tasks.open - tasks.overdue);
    push(taskReasons, { key: 'open', label: 'open task', count: g(openMinusOverdue, 'tasks.open') });

    // Leads
    const leadReasons: BadgeReason[] = [];
    push(leadReasons, { key: 'new', label: 'new lead', count: g(leads.newCount, 'leads.new'), filter: 'status=new' });
    push(leadReasons, { key: 'follow_up', label: 'lead needs follow-up', count: g(leads.followUp, 'leads.new'), filter: 'status=follow_up' });

    // Inventory
    const invReasons: BadgeReason[] = [];
    push(invReasons, { key: 'low', label: 'low-stock item', count: g(inventory, 'inventory.low') });

    // Automation / Campaigns
    const autoReasons: BadgeReason[] = [];
    push(autoReasons, { key: 'failed', label: 'failed automation', count: g(automation, 'automation.failed') });
    const campReasons: BadgeReason[] = [];
    push(campReasons, { key: 'failed', label: 'failed send', count: g(campaigns, 'automation.failed') });

    // Payment setup
    const payReasons: BadgeReason[] = [];
    push(payReasons, { key: 'stripe', label: 'Stripe setup issue', count: g(payment, 'payments.stripe_requirements') });

    // Feedback
    const fbReasons: BadgeReason[] = [];
    push(fbReasons, { key: 'unresolved', label: 'unresolved feedback', count: g(feedback.unresolved, 'feedback.low_rating'), filter: 'filter=unresolved' });
    push(fbReasons, { key: 'followup', label: 'needs follow-up', count: g(feedback.followup, 'feedback.low_rating'), filter: 'filter=followup' });

    const sum = (arr: BadgeReason[]) => arr.reduce((s, r) => s + r.count, 0);

    const breakdowns: Record<string, BadgeReason[]> = {
      '/dashboard/staff': staffReasons,
      '/dashboard/bookings': bookingReasons,
      '/dashboard/scheduler': schedulerReasons,
      '/dashboard/client-portal': portalReasons,
      '/dashboard/invoices': invoiceReasons,
      '/dashboard/messages': messageReasons,
      '/dashboard/tasks': taskReasons,
      '/dashboard/leads': leadReasons,
      '/dashboard/inventory': invReasons,
      '/dashboard/automation-center': autoReasons,
      '/dashboard/campaigns': campReasons,
      '/dashboard/payment-integration': payReasons,
      '/dashboard/feedback': fbReasons,
    };
    const counts: Record<string, number> = {};
    for (const k of Object.keys(breakdowns)) counts[k] = sum(breakdowns[k]);
    return { counts, breakdowns };
  }, [staff, bookings, clientPortal, invoices, messages, tasks, leads, inventory, automation, campaigns, payment, feedback, showBadges, sb, payoutRequired]);
}

/** Back-compat: returns just counts as before. */
export function useSidebarBadges(): Record<string, number> {
  return useSidebarBadgesFull().counts;
}

/** Convenience for per-page attention strips. */
export function usePageBadgeReasons(href: string): BadgeReason[] {
  const { breakdowns } = useSidebarBadgesFull();
  return breakdowns[href] || [];
}
