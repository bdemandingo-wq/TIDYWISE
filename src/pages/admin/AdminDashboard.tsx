import { useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { TodayStats } from '@/components/admin/TodayStats';
import { ReportsOverview } from '@/components/admin/ReportsOverview';
import { UpcomingBookings } from '@/components/admin/UpcomingBookings';
import { useBookings, useCustomers, BookingWithDetails } from '@/hooks/useBookings';
import { Loader2 } from 'lucide-react';
import { isToday } from 'date-fns';

export default function AdminDashboard() {
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings();
  const { data: customers = [], isLoading: customersLoading } = useCustomers();

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
      <AdminLayout title="Dashboard" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Dashboard"
      subtitle="Welcome back! Here's what's happening."
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main content - Reports Overview */}
        <div className="xl:col-span-2 space-y-6">
          <TodayStats 
            grossVolume={todayStats.grossVolume}
            payments={todayStats.payments}
            customers={todayStats.customers}
          />
          
          <ReportsOverview 
            bookings={bookings as BookingWithDetails[]} 
            customers={customers.map(c => ({ id: c.id, created_at: c.created_at }))}
          />
        </div>
        
        {/* Sidebar - Upcoming Bookings */}
        <div>
          <UpcomingBookings bookings={bookings as BookingWithDetails[]} />
        </div>
      </div>
    </AdminLayout>
  );
}
