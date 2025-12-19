import { AdminLayout } from '@/components/admin/AdminLayout';
import { StatCard } from '@/components/admin/StatCard';
import { UpcomingBookings } from '@/components/admin/UpcomingBookings';
import { RevenueChart } from '@/components/admin/RevenueChart';
import { useBookings, useCustomers, BookingWithDetails } from '@/hooks/useBookings';
import { Calendar, Users, DollarSign, Clock, Loader2 } from 'lucide-react';
import { useMemo } from 'react';

export default function AdminDashboard() {
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings();
  const { data: customers = [], isLoading: customersLoading } = useCustomers();

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayBookings = bookings.filter(b => {
      const bookingDate = new Date(b.scheduled_at).toISOString().split('T')[0];
      return bookingDate === today;
    });
    const pendingBookings = bookings.filter(b => b.status === 'pending');
    
    // Calculate total revenue from all bookings (not just paid/completed)
    const totalRevenue = bookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);

    return {
      todayBookings: todayBookings.length,
      pendingBookings: pendingBookings.length,
      totalCustomers: customers.length,
      totalRevenue,
    };
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
      subtitle="Welcome back! Here's what's happening today."
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Today's Bookings"
          value={stats.todayBookings}
          change={12}
          changeLabel="vs yesterday"
          trend="up"
          icon={<Calendar className="w-6 h-6" />}
        />
        <StatCard
          title="Pending Bookings"
          value={stats.pendingBookings}
          change={-5}
          changeLabel="vs last week"
          trend="down"
          icon={<Clock className="w-6 h-6" />}
        />
        <StatCard
          title="Total Customers"
          value={stats.totalCustomers}
          change={8}
          changeLabel="this month"
          trend="up"
          icon={<Users className="w-6 h-6" />}
        />
        <StatCard
          title="Total Revenue"
          value={`$${stats.totalRevenue.toLocaleString()}`}
          change={15}
          changeLabel="vs last month"
          trend="up"
          icon={<DollarSign className="w-6 h-6" />}
        />
      </div>

      {/* Charts and Lists */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <RevenueChart bookings={bookings as BookingWithDetails[]} />
        </div>
        <div>
          <UpcomingBookings bookings={bookings as BookingWithDetails[]} />
        </div>
      </div>
    </AdminLayout>
  );
}
