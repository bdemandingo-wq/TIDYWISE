import { AdminLayout } from '@/components/admin/AdminLayout';
import { SubscriptionGate } from '@/components/admin/SubscriptionGate';
import { Seo } from '@/components/Seo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Zap, Activity, Lightbulb, ScrollText } from 'lucide-react';
import { AutomationRowList } from '@/components/admin/automation/AutomationRowList';
import { AutomationLogTable } from '@/components/admin/automation/AutomationLogTable';
import { CRMSuggestionsPanel } from '@/components/admin/automation/CRMSuggestionsPanel';

export default function AutomationCenterPage() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

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

  const activeCount = automations.filter(a => a.is_enabled).length;

  return (
    <AdminLayout title="Automation Center">
      <Seo title="Automation Center" description="Manage automated workflows, view logs, and get smart suggestions." />
      <SubscriptionGate feature="Automation Center">
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium">
              <Zap className="w-4 h-4" />
              {activeCount} of {automations.length} active
            </div>
          </div>

          {/* SECTION 1 — Active Automations */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">Active Automations</h2>
            </div>
            <AutomationRowList
              automations={automations}
              isLoading={isLoading}
              onToggle={(id, enabled) => toggleMutation.mutate({ id, is_enabled: enabled })}
            />
          </section>

          {/* SECTION 2 — Recent Automation Log */}
          <section>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <ScrollText className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-base">Recent Activity</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <AutomationLogTable />
              </CardContent>
            </Card>
          </section>

          {/* SECTION 3 — Smart Suggestions */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-yellow-500" />
              <h2 className="text-base font-semibold text-foreground">Smart Suggestions</h2>
            </div>
            <CRMSuggestionsPanel />
          </section>
        </div>
      </SubscriptionGate>
    </AdminLayout>
  );
}
