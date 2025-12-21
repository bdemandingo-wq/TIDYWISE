import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { LogOut, Briefcase, CalendarCheck, Clock, DollarSign, Bell } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MyJobCard } from '@/components/staff/MyJobCard';
import { AvailableJobCard } from '@/components/staff/AvailableJobCard';
import { CleanerAvailabilityManager } from '@/components/staff/CleanerAvailabilityManager';
import { CleanerEarnings } from '@/components/staff/CleanerEarnings';

interface Booking {
  id: string;
  booking_number: number;
  scheduled_at: string;
  duration: number;
  status: string;
  address: string | null;
  city: string | null;
  state: string | null;
  total_amount: number;
  cleaner_wage: number | null;
  cleaner_wage_type: string | null;
  cleaner_actual_payment: number | null;
  customer: {
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
  service: {
    name: string;
  } | null;
}

interface StaffInfo {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  hourly_rate: number | null;
  base_wage: number | null;
  tax_classification: string | null;
}

export default function StaffPortal() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);

  // Get staff record for current user
  useEffect(() => {
    const fetchStaffRecord = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('staff')
        .select('id, name, email, phone, hourly_rate, base_wage, tax_classification')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching staff record:', error);
        toast.error('Could not find your staff profile');
        return;
      }

      setStaffInfo(data);
    };

    fetchStaffRecord();
  }, [user]);

  // Fetch assigned bookings
  const { data: assignedBookings = [], isLoading: loadingAssigned } = useQuery({
    queryKey: ['staff-bookings', 'assigned', staffInfo?.id],
    queryFn: async () => {
      if (!staffInfo?.id) return [];

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, address, city, state,
          total_amount, cleaner_wage, cleaner_wage_type, cleaner_actual_payment,
          customer:customers(first_name, last_name, phone),
          service:services(name)
        `)
        .eq('staff_id', staffInfo.id)
        .in('status', ['pending', 'confirmed', 'in_progress'])
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      return data as Booking[];
    },
    enabled: !!staffInfo?.id,
  });

  // Fetch unassigned bookings
  const { data: unassignedBookings = [], isLoading: loadingUnassigned } = useQuery({
    queryKey: ['staff-bookings', 'unassigned'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, address, city, state,
          total_amount, cleaner_wage, cleaner_wage_type, cleaner_actual_payment,
          customer:customers(first_name, last_name, phone),
          service:services(name)
        `)
        .is('staff_id', null)
        .in('status', ['pending', 'confirmed'])
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      return data as Booking[];
    },
    enabled: !!staffInfo?.id,
  });

  // Self-assign mutation
  const assignToSelf = useMutation({
    mutationFn: async (bookingId: string) => {
      if (!staffInfo?.id) throw new Error('Staff ID not found');

      const { error } = await supabase
        .from('bookings')
        .update({ staff_id: staffInfo.id })
        .eq('id', bookingId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-bookings'] });
      toast.success('Job claimed successfully!');
    },
    onError: (error) => {
      toast.error('Failed to claim job');
      console.error(error);
    },
  });

  // Update booking status mutation
  const updateStatus = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' }) => {
      const { error } = await supabase
        .from('bookings')
        .update({ status })
        .eq('id', bookingId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['staff-bookings'] });
      const statusMessages: Record<string, string> = {
        in_progress: 'Job started!',
        completed: 'Job marked as completed!',
      };
      toast.success(statusMessages[variables.status] || 'Status updated');
    },
    onError: (error) => {
      toast.error('Failed to update status');
      console.error(error);
    },
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (!user) {
    navigate('/auth');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Cleaner Portal</h1>
            <p className="text-sm text-muted-foreground">Welcome, {staffInfo?.name || 'Loading...'}</p>
          </div>
          <div className="flex items-center gap-3">
            {staffInfo && (
              <Badge variant="outline" className="hidden sm:flex">
                {staffInfo.tax_classification === 'w2' ? 'W-2 Employee' : '1099 Contractor'}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2">
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="my-jobs" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="my-jobs" className="gap-2">
              <Briefcase className="w-4 h-4 hidden sm:inline" />
              My Jobs
              {assignedBookings.length > 0 && (
                <Badge variant="secondary" className="ml-1">{assignedBookings.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="available" className="gap-2">
              <Bell className="w-4 h-4 hidden sm:inline" />
              Available
              {unassignedBookings.length > 0 && (
                <Badge variant="default" className="ml-1 bg-green-600">{unassignedBookings.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="availability" className="gap-2">
              <Clock className="w-4 h-4 hidden sm:inline" />
              Hours
            </TabsTrigger>
            <TabsTrigger value="earnings" className="gap-2">
              <DollarSign className="w-4 h-4 hidden sm:inline" />
              Earnings
            </TabsTrigger>
          </TabsList>

          {/* My Jobs Tab */}
          <TabsContent value="my-jobs" className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Your Upcoming Jobs</h2>
              <p className="text-sm text-muted-foreground">Jobs assigned to you that are coming up</p>
            </div>
            {loadingAssigned ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : assignedBookings.length === 0 ? (
              <div className="text-center py-12">
                <CalendarCheck className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No upcoming jobs assigned to you.</p>
                <p className="text-sm text-muted-foreground mt-1">Check the Available tab to claim new jobs!</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {assignedBookings.map((booking) => (
                  <MyJobCard
                    key={booking.id}
                    booking={booking}
                    onUpdateStatus={(id, status) => updateStatus.mutate({ bookingId: id, status })}
                    isUpdating={updateStatus.isPending}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Available Jobs Tab */}
          <TabsContent value="available" className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Available Jobs</h2>
              <p className="text-sm text-muted-foreground">
                Open jobs waiting to be claimed. See your potential earnings below!
              </p>
            </div>
            {loadingUnassigned ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : unassignedBookings.length === 0 ? (
              <div className="text-center py-12">
                <Briefcase className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No open jobs right now.</p>
                <p className="text-sm text-muted-foreground mt-1">Check back later for new opportunities!</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {unassignedBookings.map((booking) => (
                  <AvailableJobCard
                    key={booking.id}
                    booking={booking}
                    staffInfo={{
                      hourly_rate: staffInfo?.hourly_rate || null,
                      base_wage: staffInfo?.base_wage || null,
                    }}
                    onAssign={(id) => assignToSelf.mutate(id)}
                    isAssigning={assignToSelf.isPending}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Availability Tab */}
          <TabsContent value="availability" className="space-y-4">
            {staffInfo?.id ? (
              <CleanerAvailabilityManager staffId={staffInfo.id} />
            ) : (
              <p className="text-muted-foreground">Loading availability settings...</p>
            )}
          </TabsContent>

          {/* Earnings Tab */}
          <TabsContent value="earnings" className="space-y-4">
            {staffInfo?.id ? (
              <CleanerEarnings staffId={staffInfo.id} staffName={staffInfo.name} />
            ) : (
              <p className="text-muted-foreground">Loading earnings...</p>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
