import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, AlertTriangle, Activity, TrendingUp, Clock } from 'lucide-react';

interface QueueStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
}

export function AutomationHealthMonitor() {
  const { organization } = useOrganization();

  const { data: reviewStats } = useQuery({
    queryKey: ['automation-health-review', organization?.id],
    queryFn: async (): Promise<QueueStats> => {
      if (!organization?.id) return { total: 0, sent: 0, failed: 0, pending: 0 };
      const { data, error } = await supabase
        .from('automated_review_sms_queue')
        .select('sent, error')
        .eq('organization_id', organization.id);
      if (error) throw error;
      const items = data || [];
      return {
        total: items.length,
        sent: items.filter(i => i.sent && !i.error).length,
        failed: items.filter(i => i.sent && i.error).length,
        pending: items.filter(i => !i.sent).length,
      };
    },
    enabled: !!organization?.id,
  });

  const { data: rebookingStats } = useQuery({
    queryKey: ['automation-health-rebooking', organization?.id],
    queryFn: async (): Promise<QueueStats> => {
      if (!organization?.id) return { total: 0, sent: 0, failed: 0, pending: 0 };
      const { data, error } = await supabase
        .from('rebooking_reminder_queue')
        .select('sent, cancelled, error')
        .eq('organization_id', organization.id);
      if (error) throw error;
      const items = data || [];
      return {
        total: items.length,
        sent: items.filter((i: any) => i.sent && !i.error).length,
        failed: items.filter((i: any) => i.error).length,
        pending: items.filter((i: any) => !i.sent && !i.cancelled).length,
      };
    },
    enabled: !!organization?.id,
  });

  const { data: recurringStats } = useQuery({
    queryKey: ['automation-health-recurring', organization?.id],
    queryFn: async (): Promise<QueueStats> => {
      if (!organization?.id) return { total: 0, sent: 0, failed: 0, pending: 0 };
      const { data, error } = await supabase
        .from('recurring_offer_queue')
        .select('sent, cancelled, error')
        .eq('organization_id', organization.id);
      if (error) throw error;
      const items = data || [];
      return {
        total: items.length,
        sent: items.filter((i: any) => i.sent && !i.error).length,
        failed: items.filter((i: any) => i.error).length,
        pending: items.filter((i: any) => !i.sent && !i.cancelled).length,
      };
    },
    enabled: !!organization?.id,
  });

  const { data: reminderStats } = useQuery({
    queryKey: ['automation-health-reminders', organization?.id],
    queryFn: async (): Promise<QueueStats> => {
      if (!organization?.id) return { total: 0, sent: 0, failed: 0, pending: 0 };
      const { count, error } = await supabase
        .from('booking_reminder_log')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id);
      if (error) throw error;
      return { total: count || 0, sent: count || 0, failed: 0, pending: 0 };
    },
    enabled: !!organization?.id,
  });

  const automationQueues = [
    { name: 'Review Requests', stats: reviewStats, icon: CheckCircle2, color: 'text-amber-500' },
    { name: 'Rebooking Reminders', stats: rebookingStats, icon: TrendingUp, color: 'text-green-500' },
    { name: 'Recurring Offers', stats: recurringStats, icon: Activity, color: 'text-purple-500' },
    { name: 'Appointment Reminders', stats: reminderStats, icon: Clock, color: 'text-blue-500' },
  ];

  const totalSent = automationQueues.reduce((acc, q) => acc + (q.stats?.sent || 0), 0);
  const totalFailed = automationQueues.reduce((acc, q) => acc + (q.stats?.failed || 0), 0);
  const totalPending = automationQueues.reduce((acc, q) => acc + (q.stats?.pending || 0), 0);
  const totalAll = totalSent + totalFailed + totalPending;
  const successRate = totalAll > 0 ? Math.round(((totalSent) / (totalSent + totalFailed || 1)) * 100) : 100;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xs font-medium text-muted-foreground">Sent</span>
            </div>
            <p className="text-2xl font-bold mt-1">{totalSent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-destructive" />
              <span className="text-xs font-medium text-muted-foreground">Failed</span>
            </div>
            <p className="text-2xl font-bold mt-1">{totalFailed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <span className="text-xs font-medium text-muted-foreground">Pending</span>
            </div>
            <p className="text-2xl font-bold mt-1">{totalPending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">Success Rate</span>
            </div>
            <p className="text-2xl font-bold mt-1">{successRate}%</p>
            <Progress value={successRate} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
      </div>

      {/* Per-Automation Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automation Breakdown</CardTitle>
          <CardDescription>Performance metrics for each automation queue</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {automationQueues.map((queue) => {
            const stats = queue.stats || { total: 0, sent: 0, failed: 0, pending: 0 };
            const rate = stats.sent + stats.failed > 0
              ? Math.round((stats.sent / (stats.sent + stats.failed)) * 100)
              : 100;
            const Icon = queue.icon;
            return (
              <div key={queue.name} className="flex items-center gap-4 p-3 rounded-lg border bg-card">
                <div className={`p-2 rounded-md bg-muted ${queue.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{queue.name}</span>
                    <Badge variant={stats.failed > 0 ? 'destructive' : 'default'} className="text-xs">
                      {rate}% success
                    </Badge>
                  </div>
                  <Progress value={rate} className="h-1.5" />
                  <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>{stats.sent} sent</span>
                    {stats.failed > 0 && <span className="text-destructive">{stats.failed} failed</span>}
                    {stats.pending > 0 && <span>{stats.pending} pending</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
