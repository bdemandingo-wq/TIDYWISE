import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Clock, Star, RotateCcw, Repeat, UserX, Loader2,
  ChevronDown, ChevronUp, Save, Phone, CreditCard,
  PartyPopper, BarChart3, Trophy, Zap,
} from 'lucide-react';
import { format } from 'date-fns';

interface ReminderInterval {
  id?: string;
  label: string;
  hours_before: number;
  is_active: boolean;
  send_to_client: boolean;
  send_to_cleaner: boolean;
}

function AppointmentReminderSettings({ organizationId }: { organizationId: string }) {
  const [reminderIntervals, setReminderIntervals] = useState<ReminderInterval[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const fetchIntervals = async () => {
      try {
        const { data, error } = await supabase
          .from('appointment_reminder_intervals')
          .select('*')
          .eq('organization_id', organizationId)
          .order('hours_before', { ascending: false });
        if (error) throw error;
        if (data) {
          setReminderIntervals(data.map(d => ({
            id: d.id,
            label: d.label,
            hours_before: Number(d.hours_before),
            is_active: d.is_active,
            send_to_client: d.send_to_client,
            send_to_cleaner: d.send_to_cleaner,
          })));
        }
      } catch (error) {
        console.error('Error fetching reminder intervals:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchIntervals();
  }, [organizationId]);

  const saveIntervals = async () => {
    setSaving(true);
    try {
      for (const interval of reminderIntervals) {
        if (interval.id) {
          await supabase
            .from('appointment_reminder_intervals')
            .update({
              is_active: interval.is_active,
              send_to_client: interval.send_to_client,
              send_to_cleaner: interval.send_to_cleaner,
            })
            .eq('id', interval.id);
        }
      }
      toast.success('Reminder schedule saved');
    } catch {
      toast.error('Failed to save reminder schedule');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  }

  if (reminderIntervals.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No reminder intervals configured.</p>;
  }

  return (
    <div className="space-y-3 pt-3 border-t">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <Label className="font-medium text-sm">Reminder Schedule</Label>
      </div>
      {reminderIntervals.map((interval, index) => (
        <div key={interval.id || index} className="p-3 border rounded-lg bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{interval.label}</span>
            <Switch
              checked={interval.is_active}
              onCheckedChange={(checked) => {
                const updated = [...reminderIntervals];
                updated[index] = { ...updated[index], is_active: checked };
                setReminderIntervals(updated);
              }}
            />
          </div>
          {interval.is_active && (
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <Switch
                  checked={interval.send_to_client}
                  onCheckedChange={(checked) => {
                    const updated = [...reminderIntervals];
                    updated[index] = { ...updated[index], send_to_client: checked };
                    setReminderIntervals(updated);
                  }}
                  className="scale-75"
                />
                <span className="text-muted-foreground">Client</span>
              </label>
              <label className="flex items-center gap-1.5">
                <Switch
                  checked={interval.send_to_cleaner}
                  onCheckedChange={(checked) => {
                    const updated = [...reminderIntervals];
                    updated[index] = { ...updated[index], send_to_cleaner: checked };
                    setReminderIntervals(updated);
                  }}
                  className="scale-75"
                />
                <span className="text-muted-foreground">Cleaner</span>
              </label>
            </div>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={saveIntervals} disabled={saving} className="gap-2 w-full">
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
        Save Reminder Schedule
      </Button>
    </div>
  );
}

const activeAutomationsMeta: Record<string, {
  icon: typeof Zap;
  emoji: string;
  description: string;
  color: string;
}> = {
  appointment_reminder: {
    icon: Clock,
    emoji: '🗓️',
    description: 'Fires before every booking based on your reminder schedule',
    color: 'text-blue-500',
  },
  review_request: {
    icon: Star,
    emoji: '⭐',
    description: 'Fires 30 min after booking marked complete — sends review request SMS',
    color: 'text-amber-500',
  },
  rebooking_reminder: {
    icon: RotateCcw,
    emoji: '🔄',
    description: 'Fires 28 days after last completed cleaning with no future booking',
    color: 'text-green-500',
  },
  winback_60day: {
    icon: UserX,
    emoji: '💸',
    description: 'Fires after 60 days of no booking — sends win-back message',
    color: 'text-orange-500',
  },
  recurring_upsell: {
    icon: Repeat,
    emoji: '🔁',
    description: 'Offers recurring service plan 2 hours after first completed cleaning',
    color: 'text-purple-500',
  },
};

const availableAutomations = [
  {
    id: 'post_call_followup',
    emoji: '📞',
    icon: Phone,
    name: 'Post-Call Follow Up',
    description: 'Sends SMS after missed OpenPhone call',
  },
  {
    id: 'card_expiry_alert',
    emoji: '💳',
    icon: CreditCard,
    name: 'Card Expiry Alert',
    description: 'Warns client when saved card is about to expire',
  },
  {
    id: 'seasonal_promo',
    emoji: '🐣',
    icon: PartyPopper,
    name: 'Seasonal Promo Sender',
    description: 'Auto-sends campaign on holidays and seasonal events',
  },
  {
    id: 'weekly_summary',
    emoji: '📊',
    icon: BarChart3,
    name: 'Weekly Business Summary',
    description: 'Sends you a weekly SMS/email digest of your business stats',
  },
  {
    id: 'loyalty_milestone',
    emoji: '🏆',
    icon: Trophy,
    name: 'Loyalty Milestone',
    description: 'Triggers when client hits 5/10/20 bookings — sends reward message',
  },
];

export function AutomationsTab() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ['organization-automations', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('organization_automations')
        .select('*')
        .eq('organization_id', organization.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  // Fetch fire counts from queue tables
  const { data: fireCounts = {} } = useQuery({
    queryKey: ['automation-fire-counts', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return {};
      const counts: Record<string, { total: number; lastFired: string | null }> = {};

      // Review requests
      const { count: reviewCount } = await supabase
        .from('automated_review_sms_queue')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('sent', true);
      const { data: lastReview } = await supabase
        .from('automated_review_sms_queue')
        .select('sent_at')
        .eq('organization_id', organization.id)
        .eq('sent', true)
        .order('sent_at', { ascending: false })
        .limit(1);
      counts['review_request'] = { total: reviewCount || 0, lastFired: lastReview?.[0]?.sent_at || null };

      // Reminders
      const { count: reminderCount } = await supabase
        .from('booking_reminder_log')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id);
      const { data: lastReminder } = await supabase
        .from('booking_reminder_log')
        .select('sent_at')
        .eq('organization_id', organization.id)
        .order('sent_at', { ascending: false })
        .limit(1);
      counts['appointment_reminder'] = { total: reminderCount || 0, lastFired: lastReminder?.[0]?.sent_at || null };

      // Rebooking
      const { count: rebookCount } = await supabase
        .from('rebooking_reminder_queue')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('sent', true);
      const { data: lastRebook } = await supabase
        .from('rebooking_reminder_queue')
        .select('created_at')
        .eq('organization_id', organization.id)
        .eq('sent', true)
        .order('created_at', { ascending: false })
        .limit(1);
      counts['rebooking_reminder'] = { total: rebookCount || 0, lastFired: lastRebook?.[0]?.created_at || null };

      // Recurring upsell
      const { count: recurCount } = await supabase
        .from('recurring_offer_queue')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('sent', true);
      const { data: lastRecur } = await supabase
        .from('recurring_offer_queue')
        .select('created_at')
        .eq('organization_id', organization.id)
        .eq('sent', true)
        .order('created_at', { ascending: false })
        .limit(1);
      counts['recurring_upsell'] = { total: recurCount || 0, lastFired: lastRecur?.[0]?.created_at || null };

      // Winback (campaign SMS sends with type win_back)
      const { count: winbackCount } = await supabase
        .from('campaign_sms_sends')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('campaign_type', 'win_back');
      const { data: lastWinback } = await supabase
        .from('campaign_sms_sends')
        .select('sent_at')
        .eq('organization_id', organization.id)
        .eq('campaign_type', 'win_back')
        .order('sent_at', { ascending: false })
        .limit(1);
      counts['winback_60day'] = { total: winbackCount || 0, lastFired: lastWinback?.[0]?.sent_at || null };

      return counts;
    },
    enabled: !!organization?.id,
  });

  // Fetch history log (last 50 fired automations)
  const { data: historyLog = [] } = useQuery({
    queryKey: ['automation-history-log', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const items: Array<{
        date: string;
        automationName: string;
        clientName: string;
        messagePreview: string;
        status: 'delivered' | 'failed' | 'pending';
      }> = [];

      // Review SMS queue
      const { data: reviews } = await supabase
        .from('automated_review_sms_queue')
        .select('created_at, sent, error, customer_id')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .limit(20);

      // Reminder log
      const { data: reminders } = await supabase
        .from('booking_reminder_log')
        .select('created_at, recipient_phone, reminder_type')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .limit(20);

      // Get customer names for review entries
      const customerIds = [...new Set((reviews || []).map(r => r.customer_id).filter(Boolean))];
      let customerMap: Record<string, string> = {};
      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from('customers')
          .select('id, first_name, last_name')
          .in('id', customerIds);
        (customers || []).forEach((c) => {
          customerMap[c.id] = `${c.first_name || ''} ${c.last_name || ''}`.trim();
        });
      }

      (reviews || []).forEach(r => {
        items.push({
          date: r.created_at,
          automationName: 'Review Request',
          clientName: customerMap[r.customer_id] || 'Unknown',
          messagePreview: 'Review request SMS sent after cleaning',
          status: r.error ? 'failed' : r.sent ? 'delivered' : 'pending',
        });
      });

      (reminders || []).forEach(r => {
        items.push({
          date: r.created_at,
          automationName: `Reminder (${r.reminder_type})`,
          clientName: r.recipient_phone || 'Unknown',
          messagePreview: 'Appointment reminder SMS',
          status: 'delivered',
        });
      });

      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return items.slice(0, 50);
    },
    enabled: !!organization?.id,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { error } = await supabase
        .from('organization_automations')
        .update({ is_enabled })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-automations'] });
      toast.success('Automation updated');
    },
    onError: () => toast.error('Failed to update automation'),
  });

  const formatName = (type: string) =>
    type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace('60day', '(60 Days)');

  const activeAutos = automations.filter(a => a.is_enabled && activeAutomationsMeta[a.automation_type]);
  const inactiveAutos = automations.filter(a => !a.is_enabled && activeAutomationsMeta[a.automation_type]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ACTIVE AUTOMATIONS */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Active Automations
        </h2>
        {activeAutos.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No active automations. Enable one below to get started.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {activeAutos.map((auto) => {
              const meta = activeAutomationsMeta[auto.automation_type];
              if (!meta) return null;
              const Icon = meta.icon;
              const counts = (fireCounts as Record<string, { total: number; lastFired: string | null }>)[auto.automation_type];
              const isReminder = auto.automation_type === 'appointment_reminder';
              const isExpanded = expandedCard === auto.id;

              return (
                <Card key={auto.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`p-2.5 rounded-xl bg-muted ${meta.color} flex-shrink-0`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm">{meta.emoji}</span>
                            <h3 className="font-semibold text-foreground">{formatName(auto.automation_type)}</h3>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{meta.description}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            {counts?.lastFired && (
                              <span>Last fired: {format(new Date(counts.lastFired), 'MMM d, yyyy')}</span>
                            )}
                            <span>Fired {counts?.total || 0}x total</span>
                          </div>
                        </div>
                      </div>
                      <Switch
                        checked={auto.is_enabled}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: auto.id, is_enabled: checked })}
                        className="flex-shrink-0 scale-110"
                      />
                    </div>

                    {isReminder && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2 mt-3"
                          onClick={() => setExpandedCard(isExpanded ? null : auto.id)}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          {isExpanded ? 'Hide Schedule' : 'Edit Reminder Schedule'}
                        </Button>
                        {isExpanded && organization?.id && (
                          <AppointmentReminderSettings organizationId={organization.id} />
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* INACTIVE / AVAILABLE AUTOMATIONS FROM DB */}
      {inactiveAutos.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-muted-foreground">Disabled Automations</h2>
          <div className="space-y-3">
            {inactiveAutos.map((auto) => {
              const meta = activeAutomationsMeta[auto.automation_type];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <Card key={auto.id} className="opacity-70 hover:opacity-100 transition-opacity">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl bg-muted ${meta.color}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">{formatName(auto.automation_type)}</h3>
                          <p className="text-sm text-muted-foreground">{meta.description}</p>
                        </div>
                      </div>
                      <Switch
                        checked={false}
                        onCheckedChange={() => toggleMutation.mutate({ id: auto.id, is_enabled: true })}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* AVAILABLE (not yet created) */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-muted-foreground">Available Automations</h2>
        <p className="text-sm text-muted-foreground">Coming soon — these automations are not yet enabled for your account.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {availableAutomations.map((auto) => {
            const Icon = auto.icon;
            return (
              <Card key={auto.id} className="opacity-60">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-muted text-muted-foreground flex-shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{auto.emoji}</span>
                        <h3 className="font-medium text-foreground">{auto.name}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{auto.description}</p>
                    </div>
                    <Badge variant="outline" className="text-xs flex-shrink-0">Coming Soon</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* AUTOMATION HISTORY LOG */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Automation History</h2>
        {historyLog.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No automation history yet.</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Automation</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyLog.slice(0, 25).map((log, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(log.date), 'MMM d, h:mm a')}
                        </TableCell>
                        <TableCell className="font-medium text-sm">{log.automationName}</TableCell>
                        <TableCell className="text-sm">{log.clientName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{log.messagePreview}</TableCell>
                        <TableCell>
                          <Badge
                            variant={log.status === 'delivered' ? 'default' : log.status === 'failed' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {log.status === 'delivered' ? '✅ Delivered' : log.status === 'failed' ? '❌ Failed' : '⏳ Pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
