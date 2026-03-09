import { useMemo, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { TodayStats } from '@/components/admin/TodayStats';
import { UpcomingBookings } from '@/components/admin/UpcomingBookings';
import { useBookings, useCustomers, BookingWithDetails } from '@/hooks/useBookings';
import { Loader2, Calendar, DollarSign, Users, ChevronRight, BarChart3 } from 'lucide-react';
import { isToday } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { PageSkeleton, BookingCardSkeleton } from '@/components/ui/page-skeleton';
import { usePlatform } from '@/hooks/usePlatform';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Card } from '@/components/ui/card';

// Lazy load the heavy ReportsOverview component
const ReportsOverview = lazy(() => import('@/components/admin/ReportsOverview').then(m => ({ default: m.ReportsOverview })));

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
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
        <div className="bg-card rounded-2xl p-6 border border-border/50 animate-pulse">
          <div className="h-5 w-32 bg-muted rounded mb-4" />
          <div className="h-64 bg-muted/50 rounded-xl" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="h-5 w-40 bg-muted rounded animate-pulse" />
        {[1, 2, 3].map((i) => (
          <BookingCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function AdminDashboard() {
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings();
  const { data: customers = [], isLoading: customersLoading } = useCustomers();
  const queryClient = useQueryClient();
  const { isNative } = usePlatform();
  const { organization } = useOrganization();
  const navigate = useNavigate();

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['customers'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const todayStats = useMemo(() => {
    const todayBookings = bookings.filter(b => isToday(new Date(b.scheduled_at)) && b.status !== 'cancelled');
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

  // Native dashboard layout
  if (isNative) {
    return (
      <AdminLayout title="Dashboard">
        <div className="space-y-4 animate-fade-in">
          {/* Greeting */}
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {getGreeting()} 👋
            </h2>
            {organization?.name && (
              <p className="text-xs text-muted-foreground mt-0.5">{organization.name}</p>
            )}
          </div>

          {/* 2-column stat cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="rounded-2xl p-4 border border-border/40 shadow-none">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <p className="text-xl font-bold text-foreground">
                ${todayStats.grossVolume.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-muted-foreground">Today's Revenue</p>
            </Card>

            <Card className="rounded-2xl p-4 border border-border/40 shadow-none">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <p className="text-xl font-bold text-foreground">{todayStats.payments}</p>
              <p className="text-xs text-muted-foreground">Payments Today</p>
            </Card>

            <Card className="rounded-2xl p-4 border border-border/40 shadow-none">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <Users className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <p className="text-xl font-bold text-foreground">{todayStats.customers}</p>
              <p className="text-xs text-muted-foreground">New Customers</p>
            </Card>

            {/* View Reports card */}
            <Card
              className="rounded-2xl p-4 border border-border/40 shadow-none cursor-pointer active:scale-[0.98] transition-transform"
              onClick={() => navigate('/dashboard/reports')}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">View Reports</p>
                <ChevronRight className="w-4 h-4 text-border" />
              </div>
              <p className="text-xs text-muted-foreground">Charts & analytics</p>
            </Card>
          </div>

          {/* Upcoming Bookings - full width */}
          <UpcomingBookings bookings={bookings as BookingWithDetails[]} />
        </div>
      </AdminLayout>
    );
  }

  // Desktop / web layout (unchanged)
  return (
    <AdminLayout
      title="Dashboard"
      subtitle="Welcome back! Here's what's happening."
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-in">
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
        
        <div>
          <UpcomingBookings bookings={bookings as BookingWithDetails[]} />
        </div>
      </div>
    </AdminLayout>
  );
}
