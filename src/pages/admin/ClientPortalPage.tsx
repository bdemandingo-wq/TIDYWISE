import { AdminLayout } from '@/components/admin/AdminLayout';
import { PlanFeatureGate } from '@/components/admin/PlanFeatureGate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClientPortalUsersManager } from '@/components/admin/ClientPortalUsersManager';
import { ClientBookingRequestsManager } from '@/components/admin/ClientBookingRequestsManager';
import { EmailChangeRequestsPanel } from '@/components/admin/EmailChangeRequestsPanel';
import { LoyaltyProgramSettings } from '@/components/admin/LoyaltyProgramSettings';
import { Users, Calendar, Gift } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Badge } from '@/components/ui/badge';
import { SEOHead } from '@/components/SEOHead';

export default function ClientPortalPage() {
  const { organization } = useOrganization();

  // Get pending request count for badge
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pending-booking-requests-count', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return 0;
      // Both kinds of pending request count toward the badge — an unhandled
      // email change is as much "needs you" as an unscheduled booking.
      const [bookings, emailChanges] = await Promise.all([
        supabase
          .from('client_booking_requests')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organization.id)
          .eq('status', 'pending'),
        supabase
          .from('admin_system_notifications')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organization.id)
          .eq('type', 'email_change_request')
          .eq('is_read', false),
      ]);
      if (bookings.error) return 0;
      return (bookings.count || 0) + (emailChanges.error ? 0 : emailChanges.count || 0);
    },
    enabled: !!organization?.id,
  });

  return (
    <AdminLayout
      title="Client Portal"
      subtitle="Manage customer portal access and booking requests"
    >
<div className="portal-v2 portal-v2-scroll">
      <SEOHead title="Client Portal | TidyWise" description="Manage your client portal settings and users" noIndex />
      <PlanFeatureGate feature="client_portal">
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

        <TabsContent value="requests" className="mt-6 space-y-6">
          {/* Above the booking queue on purpose: a booking request is work to
              schedule, an email change is a person locked out of their own
              sign-in until someone acts. Renders nothing when there are none. */}
          <EmailChangeRequestsPanel />
          <ClientBookingRequestsManager />
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <ClientPortalUsersManager />
        </TabsContent>

        <TabsContent value="loyalty" className="mt-6">
          <LoyaltyProgramSettings />
        </TabsContent>
      </Tabs>
      </PlanFeatureGate>
    </div>
</AdminLayout>
  );
}
