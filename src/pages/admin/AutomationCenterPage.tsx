import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { SubscriptionGate } from '@/components/admin/SubscriptionGate';
import { Seo } from '@/components/Seo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Zap, Star, Clock, RotateCcw, Repeat, UserX,
  HelpCircle, Home, Calendar, ClipboardList, Users, Target,
  MessageSquare, Briefcase, UserCircle, CheckSquare, Package, DollarSign,
  Receipt, BarChart3, Sparkles, CreditCard, Tag, MapPin, Globe, Brain,
  Activity, Lightbulb, Send,
} from 'lucide-react';
import { AutomationHealthMonitor } from '@/components/admin/automation/AutomationHealthMonitor';
import { CRMSuggestionsPanel } from '@/components/admin/automation/CRMSuggestionsPanel';
import { CustomAutomationBuilder } from '@/components/admin/automation/CustomAutomationBuilder';
import { AutomationTemplates } from '@/components/admin/automation/AutomationTemplates';
import type { CustomAutomation } from '@/components/admin/automation/CustomAutomationBuilder';

const automationMeta: Record<string, {
  icon: typeof Zap;
  trigger: string;
  action: string;
  benefit: string;
  color: string;
}> = {
  review_request: {
    icon: Star,
    trigger: 'Cleaning marked completed',
    action: 'Sends customer a review request SMS 30 minutes after job completion',
    benefit: 'Increases Google reviews automatically and builds online reputation.',
    color: 'text-amber-500',
  },
  appointment_reminder: {
    icon: Clock,
    trigger: 'Upcoming booking detected',
    action: 'Sends reminder SMS 24 hours before the scheduled job',
    benefit: 'Reduces cancellations and no-shows by keeping customers informed.',
    color: 'text-blue-500',
  },
  rebooking_reminder: {
    icon: RotateCcw,
    trigger: 'Completed job with no future booking',
    action: 'Sends rebooking reminder 28 days after job completion',
    benefit: 'Turns one-time customers into repeat clients automatically.',
    color: 'text-green-500',
  },
  recurring_upsell: {
    icon: Repeat,
    trigger: 'Successful cleaning completed',
    action: 'Offers recurring service plan 2 hours after completion',
    benefit: 'Builds predictable recurring revenue without manual follow-up.',
    color: 'text-purple-500',
  },
  winback_60day: {
    icon: UserX,
    trigger: 'Customer inactive for 60+ days',
    action: 'Sends win-back message to re-engage dormant customers',
    benefit: 'Revives old clients automatically and reduces churn.',
    color: 'text-orange-500',
  },
};

const sidebarGuide = [
  { icon: Home, name: 'Dashboard', description: 'Your business overview — today\'s stats, upcoming bookings, and key metrics at a glance.' },
  { icon: Brain, name: 'AI Intelligence', description: 'AI-powered insights including lead scoring, churn prediction, and revenue forecasting.' },
  { icon: Calendar, name: 'Scheduler', description: 'Drag-and-drop calendar to manage and assign bookings across your team.' },
  { icon: ClipboardList, name: 'Bookings', description: 'View, create, and manage all one-time bookings with full status tracking.' },
  { icon: Repeat, name: 'Recurring', description: 'Manage recurring/subscription bookings that automatically repeat on schedule.' },
  { icon: Users, name: 'Customers', description: 'Your full customer database — contact info, booking history, and loyalty status.' },
  { icon: Globe, name: 'Client Portal', description: 'Manage client portal accounts so customers can self-serve bookings and view history.' },
  { icon: Receipt, name: 'Invoices', description: 'Create, send, and track invoices with automated payment reminders.' },
  { icon: MessageSquare, name: 'Messages', description: 'View all SMS conversations with customers sent through your OpenPhone number.' },
  { icon: CheckSquare, name: 'Tasks', description: 'Internal task manager for daily to-dos, notes, and team coordination.' },
  { icon: Target, name: 'Leads', description: 'Track and manage new leads from inquiries to converted customers.' },
  { icon: MapPin, name: 'Operations', description: 'Track daily operations — job statuses, team locations, and route planning.' },
  { icon: Zap, name: 'Campaigns', description: 'Create and send SMS marketing campaigns to targeted customer segments.' },
  { icon: MessageSquare, name: 'Feedback', description: 'Track client complaints, feedback, and resolution status.' },
  { icon: Briefcase, name: 'Services', description: 'Configure your service offerings, pricing, and duration settings.' },
  { icon: UserCircle, name: 'Staff', description: 'Manage your cleaning team — profiles, assignments, availability, and performance.' },
  { icon: CheckSquare, name: 'Checklists', description: 'Create cleaning checklists that staff follow during each job for quality control.' },
  { icon: Package, name: 'Inventory', description: 'Track cleaning supplies, equipment, and reorder levels.' },
  { icon: Tag, name: 'Discounts', description: 'Create and manage discount codes for promotions and special offers.' },
  { icon: DollarSign, name: 'Payroll', description: 'Track staff wages, hours worked, and process payroll payments.' },
  { icon: Receipt, name: 'Expenses', description: 'Log and categorize business expenses for P&L tracking.' },
  { icon: Receipt, name: 'Finance', description: 'Financial overview — revenue trends, profit margins, and cash flow analysis.' },
  { icon: BarChart3, name: 'Reports', description: 'Detailed business reports including revenue, staff productivity, and customer analytics.' },
  { icon: Sparkles, name: 'Subscription', description: 'Manage your platform subscription plan and billing.' },
  { icon: CreditCard, name: 'Payment Setup', description: 'Configure Stripe integration for accepting customer payments and deposits.' },
  { icon: HelpCircle, name: 'Help', description: 'Tutorial videos and help resources to get the most out of the platform.' },
];

export default function AutomationCenterPage() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [importTemplate, setImportTemplate] = useState<Omit<CustomAutomation, 'id'> | null>(null);

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

  return (
    <AdminLayout title="Automation Center">
      <Seo title="Automation Center" description="Manage your automated workflows and learn about platform features." />
      <SubscriptionGate feature="Automation Center">
      <div className="space-y-6">
        <Tabs defaultValue="automations" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="automations" className="gap-2"><Zap className="w-4 h-4" /> Automations</TabsTrigger>
            <TabsTrigger value="health" className="gap-2"><Activity className="w-4 h-4" /> Health Monitor</TabsTrigger>
            <TabsTrigger value="suggestions" className="gap-2"><Lightbulb className="w-4 h-4" /> Suggestions</TabsTrigger>
            <TabsTrigger value="guide" className="gap-2"><HelpCircle className="w-4 h-4" /> Feature Guide</TabsTrigger>
          </TabsList>

          <TabsContent value="automations" className="space-y-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <Card key={i} className="animate-pulse"><CardContent className="h-48" /></Card>
                ))}
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {automations.map((auto) => {
                    const meta = automationMeta[auto.automation_type];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <Card key={auto.id} className="relative overflow-hidden">
                        <div className={`absolute top-0 left-0 w-1 h-full ${auto.is_enabled ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg bg-muted ${meta.color}`}>
                                <Icon className="w-5 h-5" />
                              </div>
                              <div>
                                <CardTitle className="text-base">{formatName(auto.automation_type)}</CardTitle>
                                <Badge variant={auto.is_enabled ? 'default' : 'secondary'} className="mt-1 text-xs">
                                  {auto.is_enabled ? 'Auto' : 'Manual Only'}
                                </Badge>
                              </div>
                            </div>
                            <Switch
                              checked={auto.is_enabled}
                              onCheckedChange={(checked) => toggleMutation.mutate({ id: auto.id, is_enabled: checked })}
                            />
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                          <div>
                            <span className="font-medium text-muted-foreground">Trigger: </span>
                            <span className="text-foreground">{meta.trigger}</span>
                          </div>
                          <div>
                            <span className="font-medium text-muted-foreground">Action: </span>
                            <span className="text-foreground">{meta.action}</span>
                          </div>
                          <div className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                            <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">{meta.benefit}</span>
                          </div>
                          {!auto.is_enabled && (
                            <div className="pt-2 border-t">
                              <p className="text-xs text-muted-foreground mb-2">
                                Automatic sending is off. You can still trigger this manually from the relevant page (Bookings, Customers, etc.).
                              </p>
                              <Badge variant="outline" className="text-xs gap-1">
                                <Send className="w-3 h-3" />
                                Manual mode — send from booking/customer actions
                              </Badge>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                <div className="mt-6">
                  <CustomAutomationBuilder />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="health" className="space-y-4">
            <AutomationHealthMonitor />
          </TabsContent>

          <TabsContent value="suggestions" className="space-y-4">
            <AutomationTemplates onImport={(template) => {
              setImportTemplate(template);
              // Switch to automations tab so user can see the builder
              const tabsTrigger = document.querySelector('[data-state="active"][value="suggestions"]');
              // Navigate to automations tab
              const automationsTab = document.querySelector('[value="automations"]') as HTMLElement;
              if (automationsTab) automationsTab.click();
              toast.success(`"${template.name}" template loaded — customize it in the builder below.`);
            }} />
            <CRMSuggestionsPanel />
          </TabsContent>

          <TabsContent value="guide" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Platform Feature Guide</CardTitle>
                <CardDescription>Learn what each section of the platform does to get the most out of your account.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {sidebarGuide.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.name} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                        <div className="p-2 rounded-md bg-muted flex-shrink-0">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      </SubscriptionGate>
    </AdminLayout>
  );
}
