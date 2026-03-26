import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { LogOut, Briefcase, CalendarCheck, Clock, DollarSign, Bell, History, Sparkles, Calendar, User, Star, FileText, PenLine, Banknote } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MyJobCard } from '@/components/staff/MyJobCard';
import { AvailableJobCard } from '@/components/staff/AvailableJobCard';
import { CleanerAvailabilityManager } from '@/components/staff/CleanerAvailabilityManager';
import { CleanerEarnings } from '@/components/staff/CleanerEarnings';
import { JobHistoryCard } from '@/components/staff/JobHistoryCard';
import { CleanerProfile } from '@/components/staff/CleanerProfile';
import { CleanerCalendar } from '@/components/staff/CleanerCalendar';
import { NotificationBell } from '@/components/staff/NotificationBell';
import { CleanerReviews } from '@/components/staff/CleanerReviews';
import { BookingChecklist } from '@/components/staff/BookingChecklist';
import { StaffDocumentUpload } from '@/components/staff/StaffDocumentUpload';
import { StaffSignatureManager } from '@/components/staff/StaffSignatureManager';
import { StaffPayoutSetup } from '@/components/staff/StaffPayoutSetup';
import { OnboardingProgress } from '@/components/staff/OnboardingProgress';

interface Booking {
  id: string;
  booking_number: number;
  scheduled_at: string;
  duration: number;
  status: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  total_amount: number;
  cleaner_wage: number | null;
  cleaner_wage_type: string | null;
  cleaner_actual_payment: number | null;
  square_footage?: string | null;
  bedrooms?: string | null;
  bathrooms?: string | null;
  team_pay_share?: number | null;
  notes?: string | null;
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
  bio: string | null;
  avatar_url: string | null;
  hourly_rate: number | null;
  base_wage: number | null;
  percentage_rate: number | null;
  tax_classification: string | null;
  default_hours: number | null;
  home_address: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  organization_id: string | null;
}

export default function StaffPortal() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
  const [newJobAlert, setNewJobAlert] = useState(false);
  const [claimingBookingId, setClaimingBookingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [hasSetAvailability, setHasSetAvailability] = useState<boolean | null>(null);

  // Get staff record for current user
  useEffect(() => {
    const fetchStaffRecord = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('staff')
        .select('id, name, email, phone, bio, avatar_url, hourly_rate, base_wage, percentage_rate, tax_classification, default_hours, home_address, home_latitude, home_longitude, organization_id')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching staff record:', error);
        toast.error('Could not find your staff profile');
        return;
      }

      setStaffInfo(data);

      // Check if staff has set their availability
      const client: any = supabase;
      const { data: hours } = await client
        .from('working_hours')
        .select('id')
        .eq('staff_id', data.id)
        .limit(1);
      setHasSetAvailability(hours && hours.length > 0);
    };

    fetchStaffRecord();
  }, [user]);

  // Real-time subscription for new unassigned bookings
  useEffect(() => {
    if (!staffInfo?.id) return;

    const channel = supabase
      .channel('staff-bookings-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings',
        },
        (payload) => {
          const newBooking = payload.new as { staff_id: string | null; status: string };
          // Only notify if booking is unassigned and upcoming
          if (!newBooking.staff_id && ['pending', 'confirmed'].includes(newBooking.status)) {
            setNewJobAlert(true);
            toast.success('New job available!', {
              description: 'A new cleaning job is waiting to be claimed.',
              duration: 5000,
              icon: <Sparkles className="w-4 h-4 text-green-500" />,
            });
            queryClient.invalidateQueries({ queryKey: ['staff-bookings', 'unassigned'] });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
        },
        (payload) => {
          const updatedBooking = payload.new as { staff_id: string | null; status: string };
          const oldBooking = payload.old as { staff_id: string | null };
          
          // Booking became unassigned
          if (oldBooking.staff_id && !updatedBooking.staff_id) {
            setNewJobAlert(true);
            toast.success('Job now available!', {
              description: 'A cleaning job was unassigned and is now open.',
              duration: 5000,
              icon: <Sparkles className="w-4 h-4 text-green-500" />,
            });
            queryClient.invalidateQueries({ queryKey: ['staff-bookings', 'unassigned'] });
          }
          
          // Always invalidate to keep data fresh
          queryClient.invalidateQueries({ queryKey: ['staff-bookings'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [staffInfo?.id, queryClient]);

  // Fetch assigned bookings (including team assignments)
  const { data: assignedBookings = [], isLoading: loadingAssigned } = useQuery({
    queryKey: ['staff-bookings', 'assigned', staffInfo?.id],
    queryFn: async () => {
      if (!staffInfo?.id) return [];

      // First get directly assigned bookings
      const { data: directBookings, error: directError } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, address, city, state, zip_code,
          total_amount, cleaner_wage, cleaner_wage_type, cleaner_actual_payment,
          cleaner_checkin_at, cleaner_checkout_at, notes,
          customer:customers(first_name, last_name, phone),
          service:services(name)
        `)
        .eq('staff_id', staffInfo.id)
        .in('status', ['pending', 'confirmed', 'in_progress'])
        .order('scheduled_at', { ascending: true });

      if (directError) throw directError;

      // Then get team assignment bookings
      const { data: teamAssignments, error: teamError } = await supabase
        .from('booking_team_assignments')
        .select(`
          pay_share,
          is_primary,
          booking:bookings(
            id, booking_number, scheduled_at, duration, status, address, city, state, zip_code,
            total_amount, cleaner_wage, cleaner_wage_type, cleaner_actual_payment,
            cleaner_checkin_at, cleaner_checkout_at, notes,
            customer:customers(first_name, last_name, phone),
            service:services(name)
          )
        `)
        .eq('staff_id', staffInfo.id);

      if (teamError) throw teamError;

      // Process team bookings - filter to upcoming active ones and add pay_share
      const teamBookings = teamAssignments
        ?.filter(ta => {
          const booking = ta.booking as any;
          return booking && 
            ['pending', 'confirmed', 'in_progress'].includes(booking.status);
        })
        .map(ta => ({
          ...(ta.booking as any),
          team_pay_share: ta.pay_share,
        })) || [];

      // Merge and deduplicate (prefer team booking with pay_share if exists)
      const bookingMap = new Map<string, Booking>();
      
      for (const b of directBookings || []) {
        bookingMap.set(b.id, b as Booking);
      }
      
      for (const b of teamBookings) {
        // Team assignment overrides or adds
        bookingMap.set(b.id, b as Booking);
      }

      const allBookings = Array.from(bookingMap.values()).sort(
        (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );

      // Fetch team members for all bookings
      const bookingIds = allBookings.map(b => b.id);
      if (bookingIds.length > 0) {
        const { data: allTeamMembers } = await supabase
          .from('booking_team_assignments')
          .select('booking_id, staff:staff(id, name)')
          .in('booking_id', bookingIds);

        // Also get primary staff names for bookings
        const staffIds = [...new Set(allBookings.map(b => (b as any).staff_id).filter(Boolean))];
        const { data: primaryStaffData } = staffIds.length > 0
          ? await supabase.from('staff').select('id, name').in('id', staffIds)
          : { data: [] };

        const primaryStaffMap = new Map((primaryStaffData || []).map(s => [s.id, s.name]));

        for (const booking of allBookings) {
          const members = (allTeamMembers || [])
            .filter(tm => tm.booking_id === booking.id)
            .map(tm => (tm.staff as any)?.name)
            .filter(Boolean);
          
          const primaryName = primaryStaffMap.get((booking as any).staff_id);
          if (primaryName && !members.includes(primaryName)) {
            members.unshift(primaryName);
          }

          (booking as any).team_members = members.length > 1 ? members : [];
        }
      }

      return allBookings;
    },
    enabled: !!staffInfo?.id,
  });

  // Fetch unassigned bookings - scoped to staff's organization
  const { data: unassignedBookings = [], isLoading: loadingUnassigned } = useQuery({
    queryKey: ['staff-bookings', 'unassigned', staffInfo?.organization_id],
    queryFn: async () => {
      if (!staffInfo?.organization_id) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, address, city, state, zip_code,
          total_amount, cleaner_wage, cleaner_wage_type, cleaner_actual_payment,
          square_footage, bedrooms, bathrooms, notes,
          customer:customers(first_name, last_name, phone),
          service:services(name)
        `)
        .eq('organization_id', staffInfo.organization_id)
        .is('staff_id', null)
        .in('status', ['pending', 'confirmed'])
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      setNewJobAlert(false);
      return data as Booking[];
    },
    enabled: !!staffInfo?.id && !!staffInfo?.organization_id,
  });

  // Fetch job history (completed, cancelled, no_show)
  const { data: jobHistory = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['staff-bookings', 'history', staffInfo?.id],
    queryFn: async () => {
      if (!staffInfo?.id) return [];

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, address, city, state, zip_code,
          total_amount, cleaner_actual_payment,
          customer:customers(first_name, last_name),
          service:services(name)
        `)
        .eq('staff_id', staffInfo.id)
        .in('status', ['completed', 'cancelled', 'no_show'])
        .order('scheduled_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as Booking[];
    },
    enabled: !!staffInfo?.id,
  });

  // Self-assign mutation
  const assignToSelf = useMutation({
    mutationFn: async (bookingId: string) => {
      if (!staffInfo?.id) throw new Error('Staff ID not found');
      setClaimingBookingId(bookingId);

      const { data, error } = await supabase
        .from('bookings')
        .update({ staff_id: staffInfo.id })
        .eq('id', bookingId)
        .is('staff_id', null) // Only claim if still unassigned
        .select(`
          booking_number,
          scheduled_at,
          service:services(name),
          customer:customers(first_name, last_name)
        `);

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Job was already claimed by someone else');
      }
      return data[0];
    },
    onSuccess: (data) => {
      setClaimingBookingId(null);
      // Invalidate both assigned and unassigned queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['staff-bookings', 'assigned'] });
      queryClient.invalidateQueries({ queryKey: ['staff-bookings', 'unassigned'] });
      
      const serviceName = (data.service as { name: string } | null)?.name || 'Job';
      const customer = data.customer as { first_name: string; last_name: string } | null;
      const customerName = customer ? `${customer.first_name} ${customer.last_name}` : '';
      const scheduledDate = data.scheduled_at ? format(new Date(data.scheduled_at), 'EEE, MMM d') : '';
      
      toast.success(`Job #${data.booking_number} Claimed!`, {
        description: `${serviceName}${customerName ? ` for ${customerName}` : ''}${scheduledDate ? ` on ${scheduledDate}` : ''}`,
        duration: 5000,
      });
    },
    onError: (error: Error) => {
      setClaimingBookingId(null);
      if (error.message === 'Job was already claimed by someone else') {
        toast.error('This job was already claimed by another cleaner');
        queryClient.invalidateQueries({ queryKey: ['staff-bookings', 'unassigned'] });
      } else {
        toast.error('Failed to claim job');
      }
      console.error(error);
    },
  });

  // Update booking status mutation with timesheet tracking
  const updateStatus = useMutation({
    mutationFn: async ({ bookingId, status }: { bookingId: string; status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' }) => {
      const now = new Date().toISOString();
      
      // Build the update object based on status
      let updateData: Record<string, unknown> = { status };
      
      // TIMESHEET: When starting a job, record check-in time
      if (status === 'in_progress') {
        updateData.cleaner_checkin_at = now;
      }
      
      // TIMESHEET: When completing a job, record check-out time and calculate pay
      if (status === 'completed') {
        updateData.cleaner_checkout_at = now;
        
        // Get booking details to calculate actual payment
        const { data: bookingData } = await supabase
          .from('bookings')
          .select(`
            id, organization_id, cleaner_checkin_at, cleaner_wage, cleaner_wage_type, 
            total_amount, duration, staff_id,
            customer:customers(id, email, first_name, last_name),
            service:services(name),
            staff:staff(hourly_rate, percentage_rate, base_wage)
          `)
          .eq('id', bookingId)
          .single();
          
        if (bookingData) {
          // Calculate actual hours worked
          let actualHours = bookingData.duration / 60; // Default to scheduled duration
          if (bookingData.cleaner_checkin_at) {
            const checkinTime = new Date(bookingData.cleaner_checkin_at).getTime();
            const checkoutTime = new Date(now).getTime();
            actualHours = (checkoutTime - checkinTime) / (1000 * 60 * 60); // Convert ms to hours
          }
          
          // Calculate payment based on wage type
          let calculatedPayment = 0;
          const staff = bookingData.staff as { hourly_rate: number | null; percentage_rate: number | null; base_wage: number | null } | null;
          
          if (bookingData.cleaner_wage && bookingData.cleaner_wage_type) {
            if (bookingData.cleaner_wage_type === 'percentage') {
              calculatedPayment = (bookingData.total_amount * bookingData.cleaner_wage) / 100;
            } else if (bookingData.cleaner_wage_type === 'flat') {
              calculatedPayment = bookingData.cleaner_wage;
            } else {
              // Hourly - use actual hours worked
              calculatedPayment = bookingData.cleaner_wage * actualHours;
            }
          } else if (staff?.percentage_rate && staff.percentage_rate > 0) {
            calculatedPayment = (bookingData.total_amount * staff.percentage_rate) / 100;
          } else if (staff?.hourly_rate && staff.hourly_rate > 0) {
            calculatedPayment = staff.hourly_rate * actualHours;
          }
          
          // Only set if payment wasn't already manually set by admin
          // Check current booking to see if cleaner_actual_payment is already set
          const { data: currentBooking } = await supabase
            .from('bookings')
            .select('cleaner_actual_payment')
            .eq('id', bookingId)
            .single();
          
          if (currentBooking?.cleaner_actual_payment == null && calculatedPayment > 0) {
            updateData.cleaner_actual_payment = Math.round(calculatedPayment * 100) / 100;
          }
        }
      }
      
      const { error } = await supabase
        .from('bookings')
        .update(updateData)
        .eq('id', bookingId);

      if (error) throw error;

      // Auto-send review request when job is completed
      if (status === 'completed') {
        try {
          // Get booking details for review request
          const { data: bookingData } = await supabase
            .from('bookings')
            .select(`
              id,
              organization_id,
              customer:customers(id, email, first_name, last_name),
              service:services(name)
            `)
            .eq('id', bookingId)
            .single();

          if (bookingData?.customer?.email && bookingData?.organization_id) {
            const reviewResult = await supabase.functions.invoke('send-review-request', {
              body: {
                bookingId: bookingData.id,
                customerId: bookingData.customer.id,
                customerEmail: bookingData.customer.email,
                customerName: `${bookingData.customer.first_name} ${bookingData.customer.last_name}`,
                serviceName: bookingData.service?.name || 'Cleaning',
                organizationId: bookingData.organization_id,
              },
            });
            
            if (reviewResult.error) {
              console.error('Review request failed:', reviewResult.error);
              toast.error('Job completed, but review request failed to send');
              return { status, reviewSent: false };
            }
          } else {
            console.warn('Missing customer email or organization ID for review request');
          }
        } catch (reviewError) {
          console.error('Failed to send review request:', reviewError);
          toast.error('Job completed, but review request failed');
          return { status, reviewSent: false };
        }
      }

      return { status, reviewSent: status === 'completed' };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['staff-bookings'] });
      const statusMessages: Record<string, string> = {
        in_progress: 'Job started! Clock-in time recorded.',
        completed: result.reviewSent !== false 
          ? 'Job completed! Review request sent to customer.' 
          : 'Job completed!',
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
    navigate('/');
  };

  if (!user) {
    navigate('/auth');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Cleaner Portal</h1>
            <p className="text-sm text-muted-foreground">Welcome, {staffInfo?.name || 'Loading...'}</p>
          </div>
          <div className="flex items-center gap-3">
            {staffInfo && (
              <>
                <NotificationBell 
                  staffId={staffInfo.id} 
                  onViewJob={() => {
                    // Switch to available tab when clicking a job notification
                    const availableTab = document.querySelector('[value="available"]') as HTMLButtonElement;
                    if (availableTab) availableTab.click();
                  }}
                />
                <Badge variant="outline" className="hidden sm:flex">
                  {staffInfo.tax_classification === 'w2' ? 'W-2 Employee' : '1099 Contractor'}
                </Badge>
              </>
            )}
            <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2">
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-4">
        {/* Onboarding Progress Tracker */}
        {staffInfo?.id && staffInfo?.organization_id && (
          <OnboardingProgress
            staffId={staffInfo.id}
            organizationId={staffInfo.organization_id}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        )}

        {hasSetAvailability === false && (
          <div className="mb-4 p-4 rounded-lg border border-warning bg-warning/10 text-warning-foreground">
            <p className="font-semibold">⚠️ Set Your Availability First</p>
            <p className="text-sm text-muted-foreground">You must set your working hours before you can view or claim jobs.</p>
          </div>
        )}
        <Tabs value={activeTab || (hasSetAvailability === false ? 'availability' : 'my-jobs')} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex flex-wrap justify-start gap-1 h-auto p-1">
            <TabsTrigger value="my-jobs" className="gap-2">
              <Briefcase className="w-4 h-4 hidden sm:inline" />
              My Jobs
              {assignedBookings.length > 0 && (
                <Badge variant="secondary" className="ml-1">{assignedBookings.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="available" className="gap-2 relative">
              <Bell className="w-4 h-4 hidden sm:inline" />
              Available
              {unassignedBookings.length > 0 && (
                <Badge variant="default" className={`ml-1 ${newJobAlert ? 'bg-green-500 animate-pulse' : 'bg-green-600'}`}>
                  {unassignedBookings.length}
                </Badge>
              )}
              {newJobAlert && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping" />
              )}
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2">
              <Calendar className="w-4 h-4 hidden sm:inline" />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="w-4 h-4 hidden sm:inline" />
              History
            </TabsTrigger>
            <TabsTrigger value="availability" className="gap-2">
              <Clock className="w-4 h-4 hidden sm:inline" />
              Hours
            </TabsTrigger>
            <TabsTrigger value="earnings" className="gap-2">
              <DollarSign className="w-4 h-4 hidden sm:inline" />
              Earnings
            </TabsTrigger>
            <TabsTrigger value="reviews" className="gap-2">
              <Star className="w-4 h-4 hidden sm:inline" />
              Reviews
            </TabsTrigger>
            <TabsTrigger value="profile" className="gap-2">
              <User className="w-4 h-4 hidden sm:inline" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="w-4 h-4 hidden sm:inline" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="signatures" className="gap-2">
              <PenLine className="w-4 h-4 hidden sm:inline" />
              Signatures
            </TabsTrigger>
            <TabsTrigger value="payouts" className="gap-2">
              <Banknote className="w-4 h-4 hidden sm:inline" />
              Payouts
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
                    staffInfo={{
                      id: staffInfo?.id,
                      hourly_rate: staffInfo?.hourly_rate || null,
                      base_wage: staffInfo?.base_wage || null,
                      percentage_rate: staffInfo?.percentage_rate || null,
                      default_hours: staffInfo?.default_hours || null,
                    }}
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
                      percentage_rate: staffInfo?.percentage_rate || null,
                      default_hours: staffInfo?.default_hours || null,
                    }}
                    onAssign={(id) => assignToSelf.mutate(id)}
                    isAssigning={assignToSelf.isPending}
                    claimingBookingId={claimingBookingId}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Job History Tab */}
          <TabsContent value="history" className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Job History</h2>
              <p className="text-sm text-muted-foreground">Your completed and past jobs</p>
            </div>
            {loadingHistory ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : jobHistory.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No job history yet.</p>
                <p className="text-sm text-muted-foreground mt-1">Completed jobs will appear here.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {jobHistory.map((booking) => (
                  <JobHistoryCard key={booking.id} booking={booking} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Availability Tab */}
          <TabsContent value="availability" className="space-y-4">
            {staffInfo?.id ? (
              <CleanerAvailabilityManager
                staffId={staffInfo.id}
                onSaved={() => setHasSetAvailability(true)}
              />
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

          {/* Calendar Tab */}
          <TabsContent value="calendar" className="space-y-4">
            {staffInfo?.id ? (
              <CleanerCalendar staffId={staffInfo.id} />
            ) : (
              <p className="text-muted-foreground">Loading calendar...</p>
            )}
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className="space-y-4">
            {staffInfo?.id ? (
              <CleanerReviews staffId={staffInfo.id} />
            ) : (
              <p className="text-muted-foreground">Loading reviews...</p>
            )}
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-4">
            {staffInfo && user ? (
              <CleanerProfile staffInfo={staffInfo} userId={user.id} />
            ) : (
              <p className="text-muted-foreground">Loading profile...</p>
            )}
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4">
            {staffInfo?.id && staffInfo?.organization_id ? (
              <StaffDocumentUpload staffId={staffInfo.id} organizationId={staffInfo.organization_id} />
            ) : (
              <p className="text-muted-foreground">Loading documents...</p>
            )}
          </TabsContent>

          {/* Signatures Tab */}
          <TabsContent value="signatures" className="space-y-4">
            {staffInfo?.id && staffInfo?.organization_id ? (
              <StaffSignatureManager staffId={staffInfo.id} organizationId={staffInfo.organization_id} />
            ) : (
              <p className="text-muted-foreground">Loading signatures...</p>
            )}
          </TabsContent>

          {/* Payouts Tab */}
          <TabsContent value="payouts" className="space-y-4">
            {staffInfo?.id && staffInfo?.organization_id ? (
              <StaffPayoutSetup staffId={staffInfo.id} organizationId={staffInfo.organization_id} />
            ) : (
              <p className="text-muted-foreground">Loading payout setup...</p>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
