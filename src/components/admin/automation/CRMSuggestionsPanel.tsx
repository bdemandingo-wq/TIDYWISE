import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, Zap, Users, Repeat, MessageSquare, TrendingUp } from 'lucide-react';

interface Suggestion {
  id: string;
  title: string;
  description: string;
  action: string;
  href: string;
  icon: typeof Zap;
  priority: 'high' | 'medium' | 'low';
}

export function CRMSuggestionsPanel() {
  const { organization } = useOrganization();
  const navigate = useNavigate();

  const { data: disabledAutomations = [] } = useQuery({
    queryKey: ['disabled-automations', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('organization_automations')
        .select('automation_type')
        .eq('organization_id', organization.id)
        .eq('is_enabled', false);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const { data: inactiveCustomerCount = 0 } = useQuery({
    queryKey: ['inactive-customers-count', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return 0;
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('customers')
        .select('id, bookings!inner(scheduled_at)')
        .eq('organization_id', organization.id)
        .lt('bookings.scheduled_at', sixtyDaysAgo)
        .limit(100);
      if (error) return 0;
      return data?.length || 0;
    },
    enabled: !!organization?.id,
  });

  const { data: nonRecurringCount = 0 } = useQuery({
    queryKey: ['non-recurring-count', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return 0;
      const { count, error } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('is_recurring', false);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!organization?.id,
  });

  const { data: smsConfigured = false } = useQuery({
    queryKey: ['sms-configured', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return false;
      const { data, error } = await supabase
        .from('organization_sms_settings')
        .select('sms_enabled')
        .eq('organization_id', organization.id)
        .maybeSingle();
      if (error) return false;
      return data?.sms_enabled || false;
    },
    enabled: !!organization?.id,
  });

  const suggestions: Suggestion[] = [];

  if (!smsConfigured) {
    suggestions.push({
      id: 'sms-setup',
      title: 'Set Up SMS Messaging',
      description: 'SMS automations and campaigns require OpenPhone to be configured. Set it up to unlock automated reviews, reminders, and marketing.',
      action: 'Configure SMS',
      href: '/dashboard/settings',
      icon: MessageSquare,
      priority: 'high',
    });
  }

  if (disabledAutomations.length > 0) {
    const names = disabledAutomations.map(a => 
      a.automation_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    ).join(', ');
    suggestions.push({
      id: 'enable-automations',
      title: `Enable ${disabledAutomations.length} Disabled Automation${disabledAutomations.length > 1 ? 's' : ''}`,
      description: `You have disabled: ${names}. Enabling them can help retain customers and grow revenue automatically.`,
      action: 'Review Automations',
      href: '/dashboard/automation-center',
      icon: Zap,
      priority: 'high',
    });
  }

  if (inactiveCustomerCount > 0) {
    suggestions.push({
      id: 'followup-inactive',
      title: `Follow Up with ${inactiveCustomerCount} Inactive Clients`,
      description: 'These customers haven\'t booked in 60+ days. Send a win-back campaign to bring them back.',
      action: 'Create Campaign',
      href: '/dashboard/campaigns',
      icon: Users,
      priority: 'medium',
    });
  }

  if (nonRecurringCount > 5) {
    suggestions.push({
      id: 'recurring-offer',
      title: `${nonRecurringCount} Customers Without Recurring Service`,
      description: 'Offer recurring cleaning plans to convert one-time customers into predictable recurring revenue.',
      action: 'View Customers',
      href: '/dashboard/customers',
      icon: Repeat,
      priority: 'medium',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: 'all-good',
      title: 'You\'re All Set!',
      description: 'All automations are active and your CRM is well-configured. Keep up the great work!',
      action: 'View Dashboard',
      href: '/dashboard',
      icon: TrendingUp,
      priority: 'low',
    });
  }

  const priorityColor = {
    high: 'destructive' as const,
    medium: 'default' as const,
    low: 'secondary' as const,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-yellow-500" />
          <CardTitle className="text-base">Smart Suggestions</CardTitle>
        </div>
        <CardDescription>Recommendations to grow your business and improve automation performance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.map((suggestion) => {
          const Icon = suggestion.icon;
          return (
            <div key={suggestion.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
              <div className="p-2 rounded-md bg-muted flex-shrink-0">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium">{suggestion.title}</p>
                  <Badge variant={priorityColor[suggestion.priority]} className="text-[10px]">
                    {suggestion.priority}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{suggestion.description}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => navigate(suggestion.href)}
                >
                  {suggestion.action}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
