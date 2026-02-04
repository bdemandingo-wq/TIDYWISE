import { AdminLayout } from '@/components/admin/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClientPortalUsersManager } from '@/components/admin/ClientPortalUsersManager';
import { ClientBookingRequestsManager } from '@/components/admin/ClientBookingRequestsManager';
import { LoyaltyProgramSettings } from '@/components/admin/LoyaltyProgramSettings';
import { Users, Calendar, Gift } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Badge } from '@/components/ui/badge';

export default function ClientPortalPage() {
  const { organization } = useOrganization();

  // Get pending request count for badge
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pending-booking-requests-count', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return 0;
      const { count, error } = await supabase
        .from('client_booking_requests')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('status', 'pending');
      if (error) return 0;
      return count || 0;
    },
    enabled: !!organization?.id,
  });

  return (
    <AdminLayout
      title="Client Portal"
      subtitle="Manage customer portal access and booking requests"
    >
      <Tabs defaultValue="requests" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="requests" className="gap-2">
            <Calendar className="h-4 w-4" />
            Requests
            {pendingCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="loyalty" className="gap-2">
            <Gift className="h-4 w-4" />
            Loyalty
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-6">
          <ClientBookingRequestsManager />
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <ClientPortalUsersManager />
        </TabsContent>

        <TabsContent value="loyalty" className="mt-6">
          <LoyaltyProgramSettings />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
