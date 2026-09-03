import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { PlanFeatureGate } from '@/components/admin/PlanFeatureGate';
import { SEOHead } from '@/components/SEOHead';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Zap, Activity, Lightbulb, Shield, BookOpen, MessageSquare } from 'lucide-react';
import { AutomationsTab } from '@/components/admin/automation/AutomationsTab';
import { AutomationHealthMonitor } from '@/components/admin/automation/AutomationHealthMonitor';
import { CRMSuggestionsPanel } from '@/components/admin/automation/CRMSuggestionsPanel';
import { AutomationMessageEditor } from '@/components/admin/automation/AutomationMessageEditor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function FeatureGuideTab() {
  const guides = [
    { title: 'Review Requests', description: 'Automatically sends a review request SMS 30 minutes after a booking is marked complete. Only fires once per customer.' },
    { title: 'Appointment Reminders', description: 'Sends reminders at configurable intervals before each booking. You can customize which intervals send to the client vs. the tech.' },
    { title: 'Rebooking Reminders', description: 'If a customer has no future booking 28 days after their last completed job, they receive a nudge to rebook.' },
    { title: 'Recurring Upsell', description: 'Two hours after a one-time customer\'s first completed job, they receive an offer to switch to a recurring service plan.' },
    { title: 'Win-Back (60 Days)', description: 'Customers inactive for 60+ days receive a re-engagement message to bring them back.' },
    { title: 'Seasonal Promo Sender', description: 'Three days before each major US holiday (Christmas, Thanksgiving, July 4, etc.) we send your customers a promo SMS with a booking link. Each customer receives at most one nudge per holiday per 300 days; capped at 200 SMS per holiday firing per org. Respects marketing_status opt-outs.' },
    { title: 'Weekly Business Summary', description: 'Every Monday we email the org owner a digest of last week\'s bookings, revenue, and team stats, comparing against the prior week. Only sends to orgs that have this toggle enabled.' },
    { title: 'Recurring Booking Lapse Alert', description: 'Daily we check for active recurring bookings whose next scheduled date passed without generating a booking. If we find one, we SMS the org owner so they can investigate. Each lapse only alerts once per 7 days.' },
    { title: 'Editing your message wording', description: 'The Messages tab lets you reword the booking confirmation and the two appointment reminders. Placeholders like {customer_name} are checked when you save, so a typo is caught before anyone receives it. If a saved message ever cannot be used, we send the original wording instead (never a blank text, never literal braces).' },
    { title: 'Quote Stale Re-engage', description: 'Daily we look for quotes sitting in "sent" status for 3-4 days and SMS the customer with a friendly check-in. Fires once per quote, capped at 50 quotes per org per run, and runs earlier in the lifecycle than the existing 24-hour-before-expiry reminder.' },
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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'automations';
  return (
    <AdminLayout title="Automation Center">
<div className="portal-v2 portal-v2-scroll">
      <SEOHead title="Automation Center" description="Manage automated workflows, view logs, and get smart suggestions." noIndex />
      <PlanFeatureGate feature="automation_center">
        <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })} className="space-y-6">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="automations" className="gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              Automations
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Messages
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

          <TabsContent value="messages">
            <AutomationMessageEditor />
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
      </PlanFeatureGate>
    </div>
</AdminLayout>
  );
}
