import { useMemo, useEffect, lazy, Suspense } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { TodayStats } from '@/components/admin/TodayStats';
import { UpcomingBookings } from '@/components/admin/UpcomingBookings';
import { useBookings, useCustomers, BookingWithDetails } from '@/hooks/useBookings';
import { Loader2, Calendar, DollarSign, Users } from 'lucide-react';
import { isToday } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { PageSkeleton, BookingCardSkeleton } from '@/components/ui/page-skeleton';

// Lazy load the heavy ReportsOverview component
const ReportsOverview = lazy(() => import('@/components/admin/ReportsOverview').then(m => ({ default: m.ReportsOverview })));

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        {/* Today Stats Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-2xl p-5 border border-border/50 animate-pulse">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10" />
                <div className="h-4 w-20 bg-muted rounded" />
              </div>
              <div className="h-8 w-24 bg-muted rounded" />
            </div>
          ))}
        </div>
        
        {/* Chart Skeleton */}
        <div className="bg-card rounded-2xl p-6 border border-border/50 animate-pulse">
          <div className="h-5 w-32 bg-muted rounded mb-4" />
          <div className="h-64 bg-muted/50 rounded-xl" />
        </div>
      </div>
      
      {/* Upcoming Bookings Skeleton */}
      <div className="space-y-4">
        <div className="h-5 w-40 bg-muted rounded animate-pulse" />
        {[1, 2, 3].map((i) => (
          <BookingCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings();
  const { data: customers = [], isLoading: customersLoading } = useCustomers();
  const queryClient = useQueryClient();

  // Set up real-time subscriptions for bookings and customers
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['bookings'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customers'
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['customers'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const todayStats = useMemo(() => {
    const todayBookings = bookings.filter(b => {
      return isToday(new Date(b.scheduled_at)) && b.status !== 'cancelled';
    });
    
    const grossVolume = todayBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
    const payments = todayBookings.filter(b => b.payment_status === 'paid').length;
    const todayCustomers = customers.filter(c => isToday(new Date(c.created_at))).length;

    return { grossVolume, payments, customers: todayCustomers };
  }, [bookings, customers]);

  const isLoading = bookingsLoading || customersLoading;

  if (isLoading) {
    return (
      <AdminLayout title="Dashboard" subtitle="Loading your data...">
        <DashboardSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Dashboard"
      subtitle="Welcome back! Here's what's happening."
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-in">
        {/* Main content - Reports Overview */}
        <div className="xl:col-span-2 space-y-6">
          <TodayStats 
            grossVolume={todayStats.grossVolume}
            payments={todayStats.payments}
            customers={todayStats.customers}
          />
          
          <Suspense fallback={
            <div className="bg-card rounded-2xl p-6 border border-border/50 animate-pulse">
              <div className="h-5 w-32 bg-muted rounded mb-4" />
              <div className="h-64 bg-muted/50 rounded-xl flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            </div>
          }>
            <ReportsOverview
              bookings={bookings as BookingWithDetails[]} 
              customers={customers.map(c => ({ id: c.id, created_at: c.created_at }))}
            />
          </Suspense>
        </div>
        
        {/* Sidebar - Upcoming Bookings */}
        <div>
          <UpcomingBookings bookings={bookings as BookingWithDetails[]} />
        </div>
      </div>
    </AdminLayout>
  );
}
