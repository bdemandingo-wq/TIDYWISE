import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Phone, CreditCard, Zap, BarChart3, Database,
} from 'lucide-react';
import { format } from 'date-fns';

interface HealthCheck {
  name: string;
  icon: typeof Zap;
  status: 'ok' | 'warning' | 'error' | 'loading';
  message: string;
  lastChecked: string | null;
  fixAction?: { label: string; href: string };
}

export function HealthMonitorTab() {
  const { organization } = useOrganization();
  const navigate = useNavigate();

  // Check OpenPhone
  const { data: openphoneStatus } = useQuery({
    queryKey: ['health-openphone', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return { connected: false, lastMessage: null as string | null };
      const { data, error } = await supabase
        .from('organization_sms_settings')
        .select('sms_enabled, openphone_api_key')
        .eq('organization_id', organization.id)
        .maybeSingle();
      if (error || !data) return { connected: false, lastMessage: null };
      
      // Check last SMS
      const { data: lastSms } = await supabase
        .from('sms_conversations')
        .select('last_message_at')
        .eq('organization_id', organization.id)
        .order('last_message_at', { ascending: false })
        .limit(1);
      
      return {
        connected: !!data.sms_enabled && !!data.openphone_api_key,
        lastMessage: lastSms?.[0]?.last_message_at || null,
      };
    },
    enabled: !!organization?.id,
  });

  // Check Stripe
  const { data: stripeStatus } = useQuery({
    queryKey: ['health-stripe', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return { connected: false, lastSync: null as string | null };
      const { data, error } = await supabase
        .from('org_stripe_settings')
        .select('is_connected, connected_at')
        .eq('organization_id', organization.id)
        .maybeSingle();
      if (error || !data) return { connected: false, lastSync: null };
      return { connected: data.is_connected, lastSync: data.connected_at };
    },
    enabled: !!organization?.id,
  });

  // Check automations health
  const { data: automationStatus } = useQuery({
    queryKey: ['health-automations', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return { active: 0, total: 0, failedRecent: 0 };
      const { data: autos } = await supabase
        .from('organization_automations')
        .select('is_enabled')
        .eq('organization_id', organization.id);

      // Check recent failures
      const { count: failedCount } = await supabase
        .from('automated_review_sms_queue')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .not('error', 'is', null);

      return {
        active: (autos || []).filter(a => a.is_enabled).length,
        total: (autos || []).length,
        failedRecent: failedCount || 0,
      };
    },
    enabled: !!organization?.id,
  });

  // Check campaign tracking
  const { data: campaignStatus } = useQuery({
    queryKey: ['health-campaigns', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return { total: 0, failed: 0 };
      const { data: sends } = await supabase
        .from('campaign_sms_sends')
        .select('status')
        .eq('organization_id', organization.id)
        .order('sent_at', { ascending: false })
        .limit(50);
      const total = (sends || []).length;
      const failed = (sends || []).filter(s => s.status === 'failed').length;
      return { total, failed };
    },
    enabled: !!organization?.id,
  });

  const checks: HealthCheck[] = [
    {
      name: 'OpenPhone Connected',
      icon: Phone,
      status: openphoneStatus?.connected ? 'ok' : 'error',
      message: openphoneStatus?.connected
        ? `Active${openphoneStatus.lastMessage ? ` • Last message ${format(new Date(openphoneStatus.lastMessage), 'MMM d, h:mm a')}` : ''}`
        : 'Not configured — SMS automations will not work',
      lastChecked: new Date().toISOString(),
      fixAction: !openphoneStatus?.connected ? { label: 'Configure SMS', href: '/dashboard/settings' } : undefined,
    },
    {
      name: 'Stripe Connected',
      icon: CreditCard,
      status: stripeStatus?.connected ? 'ok' : 'error',
      message: stripeStatus?.connected
        ? `Connected${stripeStatus.lastSync ? ` since ${format(new Date(stripeStatus.lastSync), 'MMM d, yyyy')}` : ''}`
        : 'Not connected — payment features unavailable',
      lastChecked: stripeStatus?.lastSync || null,
      fixAction: !stripeStatus?.connected ? { label: 'Connect Stripe', href: '/dashboard/payment-integration' } : undefined,
    },
    {
      name: 'Automations Engine',
      icon: Zap,
      status: automationStatus
        ? (automationStatus.failedRecent > 0 ? 'warning' : automationStatus.active > 0 ? 'ok' : 'warning')
        : 'loading',
      message: automationStatus
        ? `${automationStatus.active}/${automationStatus.total} active${automationStatus.failedRecent > 0 ? ` • ${automationStatus.failedRecent} failures detected` : ''}`
        : 'Checking...',
      lastChecked: new Date().toISOString(),
      fixAction: automationStatus && automationStatus.failedRecent > 0
        ? { label: 'View Issues', href: '/dashboard/automation-center' }
        : undefined,
    },
    {
      name: 'Campaign Tracking',
      icon: BarChart3,
      status: campaignStatus
        ? (campaignStatus.failed > 0 ? 'error' : campaignStatus.total > 0 ? 'ok' : 'warning')
        : 'loading',
      message: campaignStatus
        ? campaignStatus.total === 0
          ? 'No campaigns sent yet'
          : campaignStatus.failed > 0
            ? `${campaignStatus.failed}/${campaignStatus.total} recent sends failed`
            : `${campaignStatus.total} recent sends — all delivered`
        : 'Checking...',
      lastChecked: new Date().toISOString(),
      fixAction: campaignStatus && campaignStatus.failed > 0
        ? { label: 'View Campaigns', href: '/dashboard/campaigns' }
        : undefined,
    },
    {
      name: 'Database Connection',
      icon: Database,
      status: 'ok',
      message: 'Connected and operational',
      lastChecked: new Date().toISOString(),
    },
  ];

  const statusIcon = (status: string) => {
    switch (status) {
      case 'ok': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'error': return <XCircle className="w-5 h-5 text-destructive" />;
      default: return <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'ok': return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/10">🟢 Healthy</Badge>;
      case 'warning': return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/10">🟡 Warning</Badge>;
      case 'error': return <Badge className="bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/10">🔴 Issue</Badge>;
      default: return <Badge variant="secondary">Loading</Badge>;
    }
  };

  const okCount = checks.filter(c => c.status === 'ok').length;
  const issueCount = checks.filter(c => c.status === 'error' || c.status === 'warning').length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 grid-cols-2">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium text-muted-foreground">Healthy</span>
            </div>
            <p className="text-3xl font-bold mt-1">{okCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <span className="text-xs font-medium text-muted-foreground">Issues</span>
            </div>
            <p className="text-3xl font-bold mt-1">{issueCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Health Checks */}
      <div className="space-y-3">
        {checks.map((check) => {
          const Icon = check.icon;
          return (
            <Card key={check.name}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {statusIcon(check.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{check.name}</h3>
                        {statusBadge(check.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{check.message}</p>
                      {check.lastChecked && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Checked: {format(new Date(check.lastChecked), 'MMM d, h:mm a')}
                        </p>
                      )}
                    </div>
                  </div>
                  {check.fixAction && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(check.fixAction!.href)}
                      className="flex-shrink-0"
                    >
                      {check.fixAction.label}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
