import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgRole } from '@/hooks/useOrgRole';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';

/**
 * Centralized sidebar badge counts. Each entry maps a nav href to a
 * count of unresolved / action-needed items for that section.
 * Bell/activity feed items are intentionally excluded — this is only
 * for badges that require the user to take action.
 *
 * Individual sub-counts are gated by the organization's notification
 * preferences (see useNotificationPreferences). Turning off a badge
 * only hides the count — the underlying page/data is untouched.
 */
export function useSidebarBadges(): Record<string, number> {
  const { organization } = useOrganization();
  const { hasFinancialAccess, isOwner } = useOrgRole();
  const orgId = organization?.id;
  const queryClient = useQueryClient();
  const prefs = useNotificationPreferences();
  const showBadges = prefs.channels['channel.sidebar_badge'] !== false;
  const sb = prefs.sidebar_badges;
  const on = (k: string) => showBadges && sb[k] !== false;


  const enabled = !!orgId;
  const refetchInterval = 60_000;

  // ── Staff sub-counts
  const { data: staff = { timeOff: 0, docs: 0, payout: 0 } } = useQuery({
    queryKey: ['sb-staff', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return { timeOff: 0, docs: 0, payout: 0 };
      const [timeOff, docs, payouts] = await Promise.all([
        (supabase as any).from('time_off_requests').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'pending'),
        supabase.from('staff_documents').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'pending'),
        supabase.from('staff_payout_accounts').select('id, disabled_reason, requirements_currently_due').eq('organization_id', orgId),
      ]);
      const payout = (payouts.data || []).filter((a: any) =>
        a?.disabled_reason || (Array.isArray(a?.requirements_currently_due) && a.requirements_currently_due.length > 0)
      ).length;
      return { timeOff: timeOff.count || 0, docs: docs.count || 0, payout };
    },
  });

  // ── Bookings sub-counts
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

  // ── Invoices sub-counts (owner/admin only)
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
  const { data: messages = 0 } = useQuery({
    queryKey: ['sb-messages', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { data } = await supabase.from('sms_conversations').select('unread_count').eq('organization_id', orgId);
      return (data || []).reduce((s: number, c: any) => s + (c.unread_count || 0), 0);
    },
  });

  // ── Tasks
  const { data: tasks = 0 } = useQuery({
    queryKey: ['sb-tasks', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { count } = await supabase.from('tasks_and_notes').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).in('type', ['daily', 'weekly', 'monthly']).eq('is_completed', false);
      return count || 0;
    },
  });

  // ── Leads
  const { data: leads = 0 } = useQuery({
    queryKey: ['sb-leads', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { count } = await supabase.from('leads').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'new');
      return count || 0;
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

  // ── Feedback
  const { data: feedback = 0 } = useQuery({
    queryKey: ['sb-feedback', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { count } = await supabase.from('client_feedback').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).or('is_resolved.eq.false,followup_needed.eq.true');
      return count || 0;
    },
  });

  // Realtime invalidation
  useEffect(() => {
    if (!orgId) return;
    const ch = supabase
      .channel(`sidebar-badges-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_off_requests', filter: `organization_id=eq.${orgId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['sb-staff', orgId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_booking_requests', filter: `organization_id=eq.${orgId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['sb-client-portal', orgId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `organization_id=eq.${orgId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['sb-bookings', orgId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_conversations', filter: `organization_id=eq.${orgId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['sb-messages', orgId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgId, queryClient]);

  const g = (n: number, key: string) => (on(key) ? n : 0);

  const staffTotal = g(staff.timeOff, 'staff.time_off') + g(staff.docs, 'staff.documents') + g(staff.payout, 'staff.payout');
  const bookingsTotal = g(bookings.pending, 'bookings.pending') + g(bookings.unassigned, 'bookings.unassigned') + g(bookings.payment, 'bookings.payment');
  const schedulerTotal = g(bookings.unassigned, 'scheduler.overlaps'); // scheduler shares unassigned
  const invoicesTotal = g(invoices.overdue, 'payments.failed_charges') + g(invoices.failed, 'payments.failed_charges');

  return {
    '/dashboard/staff': staffTotal,
    '/dashboard/bookings': bookingsTotal,
    '/dashboard/scheduler': schedulerTotal,
    '/dashboard/client-portal': g(clientPortal, 'client_portal.requests'),
    '/dashboard/invoices': invoicesTotal,
    '/dashboard/messages': g(messages, 'messages.unread'),
    '/dashboard/tasks': g(tasks, 'tasks.open') || g(tasks, 'tasks.overdue'),
    '/dashboard/leads': g(leads, 'leads.new'),
    '/dashboard/inventory': g(inventory, 'inventory.low'),
    '/dashboard/automation-center': g(automation, 'automation.failed'),
    '/dashboard/campaigns': g(campaigns, 'automation.failed'),
    '/dashboard/payment-integration': g(payment, 'payments.stripe_requirements'),
    '/dashboard/feedback': g(feedback, 'feedback.low_rating'),
  };
}

