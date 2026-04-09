import { AdminLayout } from '@/components/admin/AdminLayout';
import { SubscriptionGate } from '@/components/admin/SubscriptionGate';
import { SEOHead } from '@/components/SEOHead';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Zap, HelpCircle, Home, Calendar, ClipboardList, Users, Target,
  MessageSquare, Briefcase, UserCircle, CheckSquare, Package, DollarSign,
  Receipt, BarChart3, Sparkles, CreditCard, Tag, MapPin, Globe, Brain,
  Activity, Lightbulb, Repeat,
} from 'lucide-react';
import { AutomationsTab } from '@/components/admin/automation/AutomationsTab';
import { HealthMonitorTab } from '@/components/admin/automation/HealthMonitorTab';
import { SuggestionsTab } from '@/components/admin/automation/SuggestionsTab';

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
  return (
    <AdminLayout title="Automation Center">
      <SEOHead title="Automation Center" description="Manage your automated workflows and learn about platform features." />
      <SubscriptionGate feature="Automation Center">
        <div className="space-y-6">
          <Tabs defaultValue="automations" className="space-y-4">
            <TabsList className="flex-wrap h-auto gap-1 w-full">
              <TabsTrigger value="automations" className="gap-2 min-h-[44px] flex-1 sm:flex-none"><Zap className="w-4 h-4" /> Automations</TabsTrigger>
              <TabsTrigger value="health" className="gap-2 min-h-[44px] flex-1 sm:flex-none"><Activity className="w-4 h-4" /> Health</TabsTrigger>
              <TabsTrigger value="suggestions" className="gap-2 min-h-[44px] flex-1 sm:flex-none"><Lightbulb className="w-4 h-4" /> Suggestions</TabsTrigger>
              <TabsTrigger value="guide" className="gap-2 min-h-[44px] flex-1 sm:flex-none"><HelpCircle className="w-4 h-4" /> Guide</TabsTrigger>
            </TabsList>

            <TabsContent value="automations">
              <AutomationsTab />
            </TabsContent>

            <TabsContent value="health">
              <HealthMonitorTab />
            </TabsContent>

            <TabsContent value="suggestions">
              <SuggestionsTab />
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
