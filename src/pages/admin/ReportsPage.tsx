import { AdminLayout } from '@/components/admin/AdminLayout';
import { StatCard } from '@/components/admin/StatCard';
import { useBookings, useServices, useStaff, BookingWithDetails } from '@/hooks/useBookings';
import { DollarSign, TrendingUp, Users, Calendar, Loader2 } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { useMemo } from 'react';
import { format, subMonths } from 'date-fns';

// Default service colors
const defaultColors = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#f97316'
];

export default function ReportsPage() {
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings();
  const { data: services = [], isLoading: servicesLoading } = useServices();
  const { data: staff = [], isLoading: staffLoading } = useStaff();

  const isLoading = bookingsLoading || servicesLoading || staffLoading;

  const { serviceStats, staffStats, monthlyData, totalStats } = useMemo(() => {
    // Service breakdown - include all bookings for revenue tracking
    const serviceMap = new Map<string, { name: string; count: number; revenue: number; color: string }>();
    bookings.forEach((booking, index) => {
      const serviceId = booking.service?.id || 'unknown';
      const existing = serviceMap.get(serviceId) || { 
        name: booking.service?.name || 'Unknown Service', 
        count: 0, 
        revenue: 0,
        color: defaultColors[index % defaultColors.length]
      };
      existing.count += 1;
      existing.revenue += Number(booking.total_amount || 0);
      serviceMap.set(serviceId, existing);
    });
    const serviceStats = Array.from(serviceMap.values());

    // Staff performance
    const staffMap = new Map<string, { name: string; bookings: number; revenue: number }>();
    bookings.forEach(booking => {
      if (!booking.staff) return;
      const staffId = booking.staff.id;
      const existing = staffMap.get(staffId) || { name: booking.staff.name, bookings: 0, revenue: 0 };
      existing.bookings += 1;
      existing.revenue += Number(booking.total_amount || 0);
      staffMap.set(staffId, existing);
    });
    const staffStats = Array.from(staffMap.values()).sort((a, b) => b.revenue - a.revenue);

    // Monthly data - last 6 months
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(new Date(), i);
      const monthIndex = monthDate.getMonth();
      const year = monthDate.getFullYear();
      
      const monthBookings = bookings.filter(b => {
        const bookingDate = new Date(b.scheduled_at);
        return bookingDate.getMonth() === monthIndex && bookingDate.getFullYear() === year;
      });
      
      monthlyData.push({
        month: months[monthIndex],
        revenue: monthBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
        bookings: monthBookings.length,
      });
    }

    const totalRevenue = bookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
    const completedBookings = bookings.filter(b => b.status === 'completed');
    const avgBookingValue = bookings.length > 0 ? totalRevenue / bookings.length : 0;
    const totalBookings = bookings.length;
    const conversionRate = totalBookings > 0 ? Math.round((completedBookings.length / totalBookings) * 100) : 0;

    return {
      serviceStats,
      staffStats,
      monthlyData,
      totalStats: {
        totalRevenue,
        completedBookings: completedBookings.length,
        avgBookingValue,
        conversionRate,
        totalBookings,
      },
    };
  }, [bookings]);

  if (isLoading) {
    return (
      <AdminLayout title="Reports" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Reports"
      subtitle="Analytics and performance metrics"
    >
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Revenue"
          value={`$${totalStats.totalRevenue.toLocaleString()}`}
          change={18}
          changeLabel="vs last month"
          trend="up"
          icon={<DollarSign className="w-6 h-6" />}
        />
        <StatCard
          title="Total Bookings"
          value={totalStats.totalBookings}
          change={12}
          changeLabel="vs last month"
          trend="up"
          icon={<Calendar className="w-6 h-6" />}
        />
        <StatCard
          title="Avg Booking Value"
          value={`$${totalStats.avgBookingValue.toFixed(0)}`}
          change={5}
          changeLabel="vs last month"
          trend="up"
          icon={<TrendingUp className="w-6 h-6" />}
        />
        <StatCard
          title="Completion Rate"
          value={`${totalStats.conversionRate}%`}
          change={3}
          changeLabel="vs last month"
          trend="up"
          icon={<Users className="w-6 h-6" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Monthly Revenue Bar Chart */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-4">
          <h3 className="font-semibold mb-4">Monthly Revenue</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 32%, 91%)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(0, 0%, 100%)',
                    border: '1px solid hsl(214, 32%, 91%)',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                />
                <Bar dataKey="revenue" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Service Breakdown Pie Chart */}
        <div className="bg-card rounded-xl border border-border shadow-sm p-4">
          <h3 className="font-semibold mb-4">Revenue by Service</h3>
          <div className="h-[300px]">
            {serviceStats.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No service data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={serviceStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="revenue"
                    nameKey="name"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {serviceStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Staff Performance Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-4">
        <h3 className="font-semibold mb-4">Staff Performance</h3>
        {staffStats.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No staff performance data available
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="pb-3 font-medium text-muted-foreground">Staff Member</th>
                  <th className="pb-3 font-medium text-muted-foreground text-right">Bookings</th>
                  <th className="pb-3 font-medium text-muted-foreground text-right">Revenue</th>
                  <th className="pb-3 font-medium text-muted-foreground text-right">Avg/Booking</th>
                </tr>
              </thead>
              <tbody>
                {staffStats.map((staff, index) => (
                  <tr key={staff.name} className="border-b border-border/50 last:border-0">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                        <span className="font-medium">{staff.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right">{staff.bookings}</td>
                    <td className="py-3 text-right font-semibold text-success">
                      ${staff.revenue.toLocaleString()}
                    </td>
                    <td className="py-3 text-right">
                      ${staff.bookings > 0 ? (staff.revenue / staff.bookings).toFixed(0) : 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
