import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Lightbulb, Zap, Users, CreditCard, Star, Loader2 } from 'lucide-react';

interface Suggestion {
  id: string;
  emoji: string;
  title: string;
  description: string;
  actionLabel: string;
  actionType: 'navigate' | 'activate';
  href?: string;
  automationType?: string;
  priority: 'high' | 'medium' | 'low';
}

export function SuggestionsTab() {
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: disabledAutomations = [] } = useQuery({
    queryKey: ['disabled-automations-suggestions', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('organization_automations')
        .select('id, automation_type, is_enabled')
        .eq('organization_id', organization.id)
        .eq('is_enabled', false);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const { data: inactiveCount = 0 } = useQuery({
    queryKey: ['inactive-45-day-count', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return 0;
      const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
      
      // Get customers whose latest booking is older than 45 days
      const { data: customers } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', organization.id);
      
      if (!customers || customers.length === 0) return 0;

      let inactiveCustomers = 0;
      // Check in batches
      const ids = customers.map(c => c.id);
      const { data: recentBookings } = await supabase
        .from('bookings')
        .select('customer_id')
        .eq('organization_id', organization.id)
        .gte('scheduled_at', fortyFiveDaysAgo)
        .in('customer_id', ids.slice(0, 100));

      const activeIds = new Set((recentBookings || []).map(b => b.customer_id));
      inactiveCustomers = Math.min(ids.length, 100) - activeIds.size;
      
      return Math.max(0, inactiveCustomers);
    },
    enabled: !!organization?.id,
  });

  const { data: expiringCards = 0 } = useQuery({
    queryKey: ['expiring-cards-count', organization?.id],
    queryFn: async () => {
      // Placeholder — would need Stripe API to check card expirations
      return 0;
    },
    enabled: !!organization?.id,
  });

  const activateMutation = useMutation({
    mutationFn: async (automationId: string) => {
      const { error } = await supabase
        .from('organization_automations')
        .update({ is_enabled: true })
        .eq('id', automationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disabled-automations-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['organization-automations'] });
      toast.success('Automation activated!');
    },
    onError: () => toast.error('Failed to activate'),
  });

  const suggestions: Suggestion[] = [];

  // Win-back suggestion
  const winbackDisabled = disabledAutomations.find(a => a.automation_type === 'winback_60day');
  if (inactiveCount > 0 && winbackDisabled) {
    suggestions.push({
      id: 'winback',
      emoji: '💡',
      title: `You have ${inactiveCount} clients who haven't booked in 45+ days`,
      description: 'Activate Win Back to recover them automatically with a personalized SMS.',
      actionLabel: 'Activate This',
      actionType: 'activate',
      automationType: winbackDisabled.id,
      priority: 'high',
    });
  } else if (inactiveCount > 0) {
    suggestions.push({
      id: 'winback-campaign',
      emoji: '💡',
      title: `${inactiveCount} clients inactive for 45+ days`,
      description: 'Send a win-back campaign to re-engage them and fill your schedule.',
      actionLabel: 'Create Campaign',
      actionType: 'navigate',
      href: '/dashboard/campaigns',
      priority: 'high',
    });
  }

  // Review request suggestion
  const reviewDisabled = disabledAutomations.find(a => a.automation_type === 'review_request');
  if (reviewDisabled) {
    suggestions.push({
      id: 'review',
      emoji: '💡',
      title: 'Your review request automation is off',
      description: "You're missing review opportunities after every clean. Turn it on to build your online reputation automatically.",
      actionLabel: 'Activate This',
      actionType: 'activate',
      automationType: reviewDisabled.id,
      priority: 'high',
    });
  }

  // Rebooking reminder
  const rebookDisabled = disabledAutomations.find(a => a.automation_type === 'rebooking_reminder');
  if (rebookDisabled) {
    suggestions.push({
      id: 'rebook',
      emoji: '💡',
      title: 'Rebooking reminders are turned off',
      description: 'Without this, one-time clients may never rebook. Enable it to automatically follow up 28 days after each clean.',
      actionLabel: 'Activate This',
      actionType: 'activate',
      automationType: rebookDisabled.id,
      priority: 'medium',
    });
  }

  // Card expiry
  if (expiringCards > 0) {
    suggestions.push({
      id: 'cards',
      emoji: '💡',
      title: `${expiringCards} clients have cards expiring this month`,
      description: 'Activate Card Expiry Alert to avoid failed payments and billing interruptions.',
      actionLabel: 'View Details',
      actionType: 'navigate',
      href: '/dashboard/customers',
      priority: 'medium',
    });
  }

  // All good
  if (suggestions.length === 0) {
    suggestions.push({
      id: 'all-good',
      emoji: '✅',
      title: "You're all set!",
      description: 'All automations are active and your business is running smoothly. Keep up the great work!',
      actionLabel: 'View Dashboard',
      actionType: 'navigate',
      href: '/dashboard',
      priority: 'low',
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-5 h-5 text-yellow-500" />
        <h2 className="text-lg font-semibold">AI-Powered Suggestions</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Based on your real data, here are recommendations to grow your business.
      </p>

      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <Card key={suggestion.id} className="border-primary/10 hover:border-primary/30 transition-colors">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <span className="text-2xl flex-shrink-0">{suggestion.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-foreground">{suggestion.title}</h3>
                    <Badge
                      variant={suggestion.priority === 'high' ? 'destructive' : suggestion.priority === 'medium' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {suggestion.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{suggestion.description}</p>
                  <Button
                    size="sm"
                    variant={suggestion.actionType === 'activate' ? 'default' : 'outline'}
                    onClick={() => {
                      if (suggestion.actionType === 'activate' && suggestion.automationType) {
                        activateMutation.mutate(suggestion.automationType);
                      } else if (suggestion.href) {
                        navigate(suggestion.href);
                      }
                    }}
                    disabled={activateMutation.isPending}
                    className="gap-2"
                  >
                    {activateMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : suggestion.actionType === 'activate' ? (
                      <Zap className="w-3 h-3" />
                    ) : null}
                    {suggestion.actionLabel}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
