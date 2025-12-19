import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Calendar, MapPin, Clock, User, LogOut, CheckCircle2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Booking {
  id: string;
  booking_number: number;
  scheduled_at: string;
  duration: number;
  status: string;
  address: string | null;
  city: string | null;
  state: string | null;
  staff_id: string | null;
  customer: {
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
  service: {
    name: string;
  } | null;
}

export default function StaffPortal() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffName, setStaffName] = useState<string>('');

  // Get staff record for current user
  useEffect(() => {
    const fetchStaffRecord = async () => {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('staff')
        .select('id, name')
        .eq('user_id', user.id)
        .single();
      
      if (error) {
        console.error('Error fetching staff record:', error);
        toast.error('Could not find your staff profile');
        return;
      }
      
      setStaffId(data.id);
      setStaffName(data.name);
    };

    fetchStaffRecord();
  }, [user]);

  // Fetch assigned bookings
  const { data: assignedBookings = [], isLoading: loadingAssigned } = useQuery({
    queryKey: ['staff-bookings', 'assigned', staffId],
    queryFn: async () => {
      if (!staffId) return [];
      
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, address, city, state, staff_id,
          customer:customers(first_name, last_name, phone),
          service:services(name)
        `)
        .eq('staff_id', staffId)
        .in('status', ['pending', 'confirmed', 'in_progress'])
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      return data as Booking[];
    },
    enabled: !!staffId,
  });

  // Fetch unassigned bookings
  const { data: unassignedBookings = [], isLoading: loadingUnassigned } = useQuery({
    queryKey: ['staff-bookings', 'unassigned'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, address, city, state, staff_id,
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
    enabled: !!staffId,
  });

  // Self-assign mutation
  const assignToSelf = useMutation({
    mutationFn: async (bookingId: string) => {
      if (!staffId) throw new Error('Staff ID not found');
      
      const { error } = await supabase
        .from('bookings')
        .update({ staff_id: staffId })
        .eq('id', bookingId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-bookings'] });
      toast.success('Booking assigned to you!');
    },
    onError: (error) => {
      toast.error('Failed to assign booking');
      console.error(error);
    },
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      pending: 'secondary',
      confirmed: 'default',
      in_progress: 'default',
      completed: 'outline',
      cancelled: 'destructive',
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const BookingCard = ({ booking, showAssignButton = false }: { booking: Booking; showAssignButton?: boolean }) => (
    <Card key={booking.id} className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">#{booking.booking_number}</CardTitle>
            <p className="text-sm text-muted-foreground">{booking.service?.name}</p>
          </div>
          {getStatusBadge(booking.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span>{format(new Date(booking.scheduled_at), 'EEE, MMM d, yyyy')}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span>{format(new Date(booking.scheduled_at), 'h:mm a')} ({booking.duration} min)</span>
        </div>
        {booking.customer && (
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-muted-foreground" />
            <span>{booking.customer.first_name} {booking.customer.last_name}</span>
            {booking.customer.phone && <span className="text-muted-foreground">• {booking.customer.phone}</span>}
          </div>
        )}
        {booking.address && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
            <span>{booking.address}{booking.city ? `, ${booking.city}` : ''}{booking.state ? `, ${booking.state}` : ''}</span>
          </div>
        )}
        {showAssignButton && (
          <Button
            className="w-full mt-2 gap-2"
            onClick={() => assignToSelf.mutate(booking.id)}
            disabled={assignToSelf.isPending}
          >
            <CheckCircle2 className="w-4 h-4" />
            {assignToSelf.isPending ? 'Assigning...' : 'Assign to Me'}
          </Button>
        )}
      </CardContent>
    </Card>
  );

  if (!user) {
    navigate('/auth');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Staff Portal</h1>
            <p className="text-sm text-muted-foreground">Welcome, {staffName || 'Staff Member'}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="my-jobs" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="my-jobs">My Jobs ({assignedBookings.length})</TabsTrigger>
            <TabsTrigger value="available">Available ({unassignedBookings.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="my-jobs" className="space-y-4">
            <h2 className="text-lg font-semibold">Your Upcoming Jobs</h2>
            {loadingAssigned ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : assignedBookings.length === 0 ? (
              <p className="text-muted-foreground">No upcoming jobs assigned to you.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {assignedBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="available" className="space-y-4">
            <h2 className="text-lg font-semibold">Available Jobs</h2>
            <p className="text-sm text-muted-foreground">These jobs haven't been assigned yet. Click to assign yourself.</p>
            {loadingUnassigned ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : unassignedBookings.length === 0 ? (
              <p className="text-muted-foreground">No unassigned jobs available.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {unassignedBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} showAssignButton />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}