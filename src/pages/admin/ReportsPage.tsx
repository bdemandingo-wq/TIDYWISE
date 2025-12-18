import { AdminLayout } from '@/components/admin/AdminLayout';
import { StatCard } from '@/components/admin/StatCard';
import { RevenueChart } from '@/components/admin/RevenueChart';
import { mockBookings, mockServices, mockStaff } from '@/data/mockData';
import { DollarSign, TrendingUp, Users, Calendar } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { useMemo } from 'react';

export default function ReportsPage() {
  const { serviceStats, staffStats, monthlyData, totalStats } = useMemo(() => {
    const completedBookings = mockBookings.filter(b => b.status === 'completed');
    
    // Service breakdown
    const serviceMap = new Map<string, { name: string; count: number; revenue: number; color: string }>();
    completedBookings.forEach(booking => {
      const service = mockServices.find(s => s.id === booking.serviceId);
      const existing = serviceMap.get(booking.serviceId) || { 
        name: booking.service, 
        count: 0, 
        revenue: 0,
        color: service?.color || '#6b7280'
      };
      existing.count += 1;
      existing.revenue += booking.price;
      serviceMap.set(booking.serviceId, existing);
    });
    const serviceStats = Array.from(serviceMap.values());

    // Staff performance
    const staffMap = new Map<string, { name: string; bookings: number; revenue: number }>();
    completedBookings.forEach(booking => {
      const existing = staffMap.get(booking.staffId) || { name: booking.staff, bookings: 0, revenue: 0 };
      existing.bookings += 1;
      existing.revenue += booking.price;
      staffMap.set(booking.staffId, existing);
    });
    const staffStats = Array.from(staffMap.values()).sort((a, b) => b.revenue - a.revenue);

    // Monthly data - derived from actual bookings
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const monthIndex = (currentMonth - i + 12) % 12;
      const monthBookings = completedBookings.filter(b => {
        const bookingDate = new Date(b.date);
        return bookingDate.getMonth() === monthIndex;
      });
      monthlyData.push({
        month: months[monthIndex],
        revenue: monthBookings.reduce((sum, b) => sum + b.price, 0),
        bookings: monthBookings.length,
      });
    }

    const totalRevenue = completedBookings.reduce((sum, b) => sum + b.price, 0);
    const avgBookingValue = totalRevenue / completedBookings.length || 0;

    return {
      serviceStats,
      staffStats,
      monthlyData,
      totalStats: {
        totalRevenue,
        completedBookings: completedBookings.length,
        avgBookingValue,
        conversionRate: 87,
      },
    };
  }, []);

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
          title="Completed Bookings"
          value={totalStats.completedBookings}
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
          title="Conversion Rate"
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
          </div>
        </div>
      </div>

      {/* Staff Performance Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-4">
        <h3 className="font-semibold mb-4">Staff Performance</h3>
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
                    ${(staff.revenue / staff.bookings).toFixed(0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
