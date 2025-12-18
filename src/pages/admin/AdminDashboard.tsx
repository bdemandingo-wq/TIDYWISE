import { AdminLayout } from '@/components/admin/AdminLayout';
import { StatCard } from '@/components/admin/StatCard';
import { UpcomingBookings } from '@/components/admin/UpcomingBookings';
import { RevenueChart } from '@/components/admin/RevenueChart';
import { mockBookings, mockCustomers } from '@/data/mockData';
import { Calendar, Users, DollarSign, TrendingUp, Clock } from 'lucide-react';
import { useMemo } from 'react';

export default function AdminDashboard() {
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayBookings = mockBookings.filter(b => b.date === today);
    const pendingBookings = mockBookings.filter(b => b.status === 'pending');
    const completedBookings = mockBookings.filter(b => b.status === 'completed');
    const totalRevenue = completedBookings.reduce((sum, b) => sum + b.price, 0);

    return {
      todayBookings: todayBookings.length,
      pendingBookings: pendingBookings.length,
      totalCustomers: mockCustomers.length,
      totalRevenue,
    };
  }, []);

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
          <RevenueChart bookings={mockBookings} />
        </div>
        <div>
          <UpcomingBookings bookings={mockBookings} />
        </div>
      </div>
    </AdminLayout>
  );
}
