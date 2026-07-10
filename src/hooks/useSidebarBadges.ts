import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgRole } from '@/hooks/useOrgRole';

/**
 * Centralized sidebar badge counts. Each entry maps a nav href to a
 * count of unresolved / action-needed items for that section.
 * Bell/activity feed items are intentionally excluded — this is only
 * for badges that require the user to take action.
 */
export function useSidebarBadges(): Record<string, number> {
  const { organization } = useOrganization();
  const { hasFinancialAccess, isOwner } = useOrgRole();
  const orgId = organization?.id;
  const queryClient = useQueryClient();

  const enabled = !!orgId;
  const refetchInterval = 60_000;

  // ── Staff: pending time-off + pending docs + payout problems
  const { data: staffBadge = 0 } = useQuery({
    queryKey: ['sb-staff', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const [timeOff, docs, payouts] = await Promise.all([
        (supabase as any)
          .from('time_off_requests')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'pending'),
        supabase
          .from('staff_documents')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'pending'),
        supabase
          .from('staff_payout_accounts')
          .select('id, payouts_enabled, disabled_reason, requirements_currently_due')
          .eq('organization_id', orgId),
      ]);
      const payoutProblems = (payouts.data || []).filter((a: any) =>
        a?.disabled_reason ||
        (Array.isArray(a?.requirements_currently_due) && a.requirements_currently_due.length > 0)
      ).length;
      return (timeOff.count || 0) + (docs.count || 0) + payoutProblems;
    },
  });

  // ── Bookings: upcoming pending + unassigned + payment failed
  const { data: bookingsBadge = 0 } = useQuery({
    queryKey: ['sb-bookings', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const now = new Date().toISOString();
      const [pending, unassigned, failed] = await Promise.all([
        supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'pending')
          .gte('scheduled_at', now),
        supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .is('staff_id', null)
          .neq('status', 'cancelled')
          .gte('scheduled_at', now),
        supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('payment_status', 'failed'),
      ]);
      return (pending.count || 0) + (unassigned.count || 0) + (failed.count || 0);
    },
  });

  // ── Scheduler: unassigned upcoming (subset used above)
  const { data: schedulerBadge = 0 } = useQuery({
    queryKey: ['sb-scheduler', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const now = new Date().toISOString();
      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .is('staff_id', null)
        .neq('status', 'cancelled')
        .gte('scheduled_at', now);
      return count || 0;
    },
  });

  // ── Client Portal: pending client booking requests
  const { data: clientPortalBadge = 0 } = useQuery({
    queryKey: ['sb-client-portal', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { count } = await supabase
        .from('client_booking_requests')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'pending');
      return count || 0;
    },
  });

  // ── Invoices: overdue + failed
  const { data: invoicesBadge = 0 } = useQuery({
    queryKey: ['sb-invoices', orgId],
    enabled: enabled && hasFinancialAccess,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const nowIso = new Date().toISOString().slice(0, 10);
      const [overdue, failed] = await Promise.all([
        supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .neq('status', 'paid')
          .neq('status', 'void')
          .not('due_date', 'is', null)
          .lt('due_date', nowIso),
        supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'failed'),
      ]);
      return (overdue.count || 0) + (failed.count || 0);
    },
  });

  // ── Messages: unread SMS
  const { data: messagesBadge = 0 } = useQuery({
    queryKey: ['sb-messages', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { data } = await supabase
        .from('sms_conversations')
        .select('unread_count')
        .eq('organization_id', orgId);
      return (data || []).reduce((s: number, c: any) => s + (c.unread_count || 0), 0);
    },
  });

  // ── Tasks: incomplete + overdue emphasis
  const { data: tasksBadge = 0 } = useQuery({
    queryKey: ['sb-tasks', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { count } = await supabase
        .from('tasks_and_notes')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .in('type', ['daily', 'weekly', 'monthly'])
        .eq('is_completed', false);
      return count || 0;
    },
  });

  // ── Leads: new leads
  const { data: leadsBadge = 0 } = useQuery({
    queryKey: ['sb-leads', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'new');
      return count || 0;
    },
  });

  // ── Inventory: low or out of stock
  const { data: inventoryBadge = 0 } = useQuery({
    queryKey: ['sb-inventory', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { data } = await supabase
        .from('inventory_items')
        .select('quantity, min_quantity')
        .eq('organization_id', orgId);
      return (data || []).filter((i: any) =>
        (i.quantity ?? 0) <= (i.min_quantity ?? 0)
      ).length;
    },
  });

  // ── Automation Center: failed automation runs (last 7d)
  const { data: automationBadge = 0 } = useQuery({
    queryKey: ['sb-automation', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const { count } = await supabase
        .from('custom_automation_logs')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'failed')
        .gte('created_at', since);
      return count || 0;
    },
  });

  // ── Campaigns: recent failed sends
  const { data: campaignsBadge = 0 } = useQuery({
    queryKey: ['sb-campaigns', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const [sms, emails] = await Promise.all([
        supabase
          .from('campaign_sms_sends')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'failed')
          .gte('created_at', since),
        supabase
          .from('campaign_emails')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'failed')
          .gte('created_at', since),
      ]);
      return (sms.count || 0) + (emails.count || 0);
    },
  });

  // ── Payment Setup: stripe not connected / requirements due (owner only)
  const { data: paymentBadge = 0 } = useQuery({
    queryKey: ['sb-payment', orgId],
    enabled: enabled && isOwner,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { data } = await supabase
        .from('org_stripe_settings')
        .select('is_connected, stripe_payouts_enabled')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (!data) return 1; // needs setup
      let n = 0;
      if (!data.is_connected) n += 1;
      else if (data.stripe_payouts_enabled === false) n += 1;
      return n;
    },
  });

  // ── Feedback: unresolved / needs followup
  const { data: feedbackBadge = 0 } = useQuery({
    queryKey: ['sb-feedback', orgId],
    enabled,
    refetchInterval,
    queryFn: async () => {
      if (!orgId) return 0;
      const { count } = await supabase
        .from('client_feedback')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .or('is_resolved.eq.false,followup_needed.eq.true');
      return count || 0;
    },
  });

  // Realtime invalidation for the most active sources
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
        queryClient.invalidateQueries({ queryKey: ['sb-scheduler', orgId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_conversations', filter: `organization_id=eq.${orgId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['sb-messages', orgId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgId, queryClient]);

  return {
    '/dashboard/staff': staffBadge,
    '/dashboard/bookings': bookingsBadge,
    '/dashboard/scheduler': schedulerBadge,
    '/dashboard/client-portal': clientPortalBadge,
    '/dashboard/invoices': invoicesBadge,
    '/dashboard/messages': messagesBadge,
    '/dashboard/tasks': tasksBadge,
    '/dashboard/leads': leadsBadge,
    '/dashboard/inventory': inventoryBadge,
    '/dashboard/automation-center': automationBadge,
    '/dashboard/campaigns': campaignsBadge,
    '/dashboard/payment-integration': paymentBadge,
    '/dashboard/feedback': feedbackBadge,
  };
}
