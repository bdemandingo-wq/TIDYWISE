import { AdminLayout } from '@/components/admin/AdminLayout';
import { SubscriptionGate } from '@/components/admin/SubscriptionGate';
import { Seo } from '@/components/Seo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Zap, Activity, Lightbulb, Shield, BookOpen } from 'lucide-react';
import { AutomationsTab } from '@/components/admin/automation/AutomationsTab';
import { AutomationHealthMonitor } from '@/components/admin/automation/AutomationHealthMonitor';
import { CRMSuggestionsPanel } from '@/components/admin/automation/CRMSuggestionsPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function FeatureGuideTab() {
  const guides = [
    { title: 'Review Requests', description: 'Automatically sends a review request SMS 30 minutes after a booking is marked complete. Only fires once per customer.' },
    { title: 'Appointment Reminders', description: 'Sends reminders at configurable intervals before each booking. You can customize which intervals send to the client vs. the tech.' },
    { title: 'Rebooking Reminders', description: 'If a customer has no future booking 28 days after their last completed job, they receive a nudge to rebook.' },
    { title: 'Recurring Upsell', description: 'Two hours after a one-time customer\'s first completed job, they receive an offer to switch to a recurring service plan.' },
    { title: 'Win-Back (60 Days)', description: 'Customers inactive for 60+ days receive a re-engagement message to bring them back.' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">How each automation works and when it fires.</p>
      <div className="space-y-3">
        {guides.map((g) => (
          <Card key={g.title}>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm text-foreground">{g.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{g.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function AutomationCenterPage() {
  return (
    <AdminLayout title="Automation Center">
      <Seo title="Automation Center" description="Manage automated workflows, view logs, and get smart suggestions." />
      <SubscriptionGate feature="Automation Center">
        <Tabs defaultValue="automations" className="space-y-6">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="automations" className="gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              Automations
            </TabsTrigger>
            <TabsTrigger value="health" className="gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Health Monitor
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="gap-1.5">
              <Lightbulb className="w-3.5 h-3.5" />
              Suggestions
            </TabsTrigger>
            <TabsTrigger value="guide" className="gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              Feature Guide
            </TabsTrigger>
          </TabsList>

          <TabsContent value="automations">
            <AutomationsTab />
          </TabsContent>

          <TabsContent value="health">
            <AutomationHealthMonitor />
          </TabsContent>

          <TabsContent value="suggestions">
            <CRMSuggestionsPanel />
          </TabsContent>

          <TabsContent value="guide">
            <FeatureGuideTab />
          </TabsContent>
        </Tabs>
      </SubscriptionGate>
    </AdminLayout>
  );
}
