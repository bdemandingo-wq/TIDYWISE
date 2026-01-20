import { AdminLayout } from '@/components/admin/AdminLayout';
import { StatCard } from '@/components/admin/StatCard';
import { useBookings, useServices, useStaff, BookingWithDetails } from '@/hooks/useBookings';
import { DollarSign, TrendingUp, Users, Calendar, Loader2, Repeat, UserCheck } from 'lucide-react';
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
import { useMemo, useState, useEffect } from 'react';
import { format, subMonths, isAfter, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfitMarginReport } from '@/components/admin/ProfitMarginReport';
import { CleanerPerformanceDashboard } from '@/components/admin/CleanerPerformanceDashboard';
import { ProfitByServiceChart } from '@/components/admin/ProfitByServiceChart';
import { CleanerAvailabilityDashboard } from '@/components/admin/CleanerAvailabilityDashboard';
import { CustomerLifetimeValue } from '@/components/admin/CustomerLifetimeValue';
import { StaffProductivityMetrics } from '@/components/admin/StaffProductivityMetrics';
import { RevenueForecasting } from '@/components/admin/RevenueForecasting';
import { PnLOverview } from '@/components/admin/PnLOverview';
import { supabase } from '@/integrations/supabase/client';
import { useTestMode } from '@/contexts/TestModeContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as DatePicker } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';

// Default service colors
const defaultColors = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#f97316'
];

export default function ReportsPage() {
  const { data: bookings = [], isLoading: bookingsLoading } = useBookings();
  const { data: services = [], isLoading: servicesLoading } = useServices();
  const { data: staff = [], isLoading: staffLoading } = useStaff();
  const [workingHours, setWorkingHours] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [recurringBookings, setRecurringBookings] = useState<any[]>([]);
  const [recurringStats, setRecurringStats] = useState<{ recurringClients: number; recurringCleans: number; recurringRevenue: number }>({
    recurringClients: 0,
    recurringCleans: 0,
    recurringRevenue: 0
  });
  const { isTestMode, maskName } = useTestMode();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subMonths(startOfMonth(new Date()), 5),
    to: endOfMonth(new Date()),
  });

  useEffect(() => {
    const fetchData = async () => {
      const [workingHoursRes, customersRes, recurringRes] = await Promise.all([
        supabase.from('working_hours').select('*'),
        supabase.from('customers').select('id, first_name, last_name, email, created_at, is_recurring, address'),
        supabase.from('recurring_bookings').select('total_amount, frequency, is_active, customer_id')
      ]);
      if (workingHoursRes.data) setWorkingHours(workingHoursRes.data);
      if (customersRes.data) setCustomers(customersRes.data);
      if (recurringRes.data) setRecurringBookings(recurringRes.data);

      // Calculate recurring stats
      // Recurring clients = customers with is_recurring = true OR active recurring booking
      const recurringClientIds = new Set<string>();
      
      // Add customers marked as recurring
      customersRes.data?.forEach((c: any) => {
        if (c.is_recurring) recurringClientIds.add(c.id);
      });
      
      // Add customers with active recurring bookings (includes Airbnb)
      recurringRes.data?.forEach((rb: any) => {
        if (rb.is_active && rb.customer_id) recurringClientIds.add(rb.customer_id);
      });
      
      setRecurringStats({
        recurringClients: recurringClientIds.size,
        recurringCleans: 0, // Will be calculated from bookings in useMemo
        recurringRevenue: 0
      });
    };
    fetchData();
  }, []);

  const isLoading = bookingsLoading || servicesLoading || staffLoading;

  // Filter bookings by date range
  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const bookingDate = new Date(b.scheduled_at);
      return isWithinInterval(bookingDate, { start: dateRange.from, end: dateRange.to });
    });
  }, [bookings, dateRange]);

  const { serviceStats, staffStats, monthlyData, totalStats, recurringCleansCount, recurringCleansRevenue } = useMemo(() => {
    // Build a set of recurring customer IDs for quick lookup
    const recurringCustomerIds = new Set<string>();
    customers.forEach((c: any) => {
      if (c.is_recurring) recurringCustomerIds.add(c.id);
    });
    recurringBookings.forEach((rb: any) => {
      if (rb.is_active && rb.customer_id) recurringCustomerIds.add(rb.customer_id);
    });

    // Service breakdown - include all bookings for revenue tracking
    const serviceMap = new Map<string, { name: string; count: number; revenue: number; color: string }>();
    let recurringCleansCount = 0;
    let recurringCleansRevenue = 0;

    filteredBookings.forEach((booking, index) => {
      const serviceId = booking.service?.id || 'refund';
      const existing = serviceMap.get(serviceId) || { 
        name: booking.service?.name || 'Refund', 
        count: 0,
        revenue: 0,
        color: booking.service?.name ? defaultColors[index % defaultColors.length] : '#ef4444'
      };
      existing.count += 1;
      existing.revenue += Number(booking.total_amount || 0);
      serviceMap.set(serviceId, existing);

      // Count recurring cleans - bookings from recurring customers
      const customerId = booking.customer?.id;
      if (customerId && recurringCustomerIds.has(customerId)) {
        recurringCleansCount += 1;
        recurringCleansRevenue += Number(booking.total_amount || 0);
      }
    });
    const serviceStats = Array.from(serviceMap.values());

    // Staff performance - include ALL staff members and show upcoming cleans
    const now = new Date();
    const staffStatsData = staff.map((s, index) => {
      // Get all bookings for this staff member within date range
      const staffBookings = filteredBookings.filter(b => b.staff?.id === s.id);
      
      // Calculate total payment from cleaner_actual_payment
      const totalPayment = staffBookings.reduce((sum, b) => {
        return sum + Number((b as any).cleaner_actual_payment || 0);
      }, 0);
      
      // Count upcoming cleans (scheduled_at > now and not cancelled/completed)
      const upcomingCleans = staffBookings.filter(b => {
        const scheduledDate = new Date(b.scheduled_at);
        return isAfter(scheduledDate, now) && 
               !['completed', 'cancelled', 'no_show'].includes(b.status);
      }).length;

      // Count completed bookings
      const completedBookings = staffBookings.filter(b => b.status === 'completed').length;

      return {
        name: s.name,
        bookings: completedBookings,
        upcomingCleans,
        payment: totalPayment,
      };
    });
    const staffStats = staffStatsData.sort((a, b) => b.payment - a.payment);

    // Monthly data - within date range
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(new Date(), i);
      const monthIndex = monthDate.getMonth();
      const year = monthDate.getFullYear();
      
      const monthBookings = filteredBookings.filter(b => {
        const bookingDate = new Date(b.scheduled_at);
        return bookingDate.getMonth() === monthIndex && bookingDate.getFullYear() === year;
      });
      if (monthBookings.length > 0 || i < 3) {
        monthlyData.push({
          month: months[monthIndex],
          revenue: monthBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
          bookings: monthBookings.length,
        });
      }
    }

    const totalRevenue = filteredBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
    const completedBookings = filteredBookings.filter(b => b.status === 'completed');
    const avgBookingValue = filteredBookings.length > 0 ? totalRevenue / filteredBookings.length : 0;
    const totalBookings = filteredBookings.length;
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
      recurringCleansCount,
      recurringCleansRevenue,
    };
  }, [filteredBookings, staff, customers, recurringBookings]);

  const [activeTab, setActiveTab] = useState('overview');

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
      actions={
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarIcon className="w-4 h-4" />
                {format(dateRange.from, 'MMM d, yyyy')} - {format(dateRange.to, 'MMM d, yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <DatePicker
                      mode="single"
                      selected={dateRange.from}
                      onSelect={(date) => date && setDateRange(prev => ({ ...prev, from: date }))}
                      className="rounded-md border"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <DatePicker
                      mode="single"
                      selected={dateRange.to}
                      onSelect={(date) => date && setDateRange(prev => ({ ...prev, to: date }))}
                      className="rounded-md border"
                    />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      }
    >
      {/* Summary Stats - Uniform Card Size */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <StatCard
          title="Total Revenue"
          value={isTestMode ? '$X,XXX' : `$${totalStats.totalRevenue.toLocaleString()}`}
          change={18}
          changeLabel="vs last month"
          trend="up"
          icon={<DollarSign className="w-6 h-6" />}
        />
        <StatCard
          title="Total Bookings"
          value={isTestMode ? 'XX' : totalStats.totalBookings}
          change={12}
          changeLabel="vs last month"
          trend="up"
          icon={<Calendar className="w-6 h-6" />}
        />
        <StatCard
          title={`Recurring Cleans (${new Date().getFullYear()})`}
          value={isTestMode ? 'XX' : recurringCleansCount}
          change={0}
          changeLabel={isTestMode ? '$X,XXX revenue' : `$${recurringCleansRevenue.toLocaleString()} revenue`}
          trend="up"
          icon={<Repeat className="w-6 h-6" />}
        />
        <StatCard
          title="Recurring Clients"
          value={isTestMode ? 'XX' : recurringStats.recurringClients}
          change={0}
          changeLabel="with active plans"
          trend="up"
          icon={<UserCheck className="w-6 h-6" />}
        />
        <StatCard
          title="Avg Booking Value"
          value={isTestMode ? '$XXX' : `$${totalStats.avgBookingValue.toFixed(0)}`}
          change={5}
          changeLabel="vs last month"
          trend="up"
          icon={<TrendingUp className="w-6 h-6" />}
        />
        <StatCard
          title="Completion Rate"
          value={isTestMode ? 'XX%' : `${totalStats.conversionRate}%`}
          change={3}
          changeLabel="vs last month"
          trend="up"
          icon={<Users className="w-6 h-6" />}
        />
      </div>

      {/* Tabs for different reports */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-secondary/50 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pnl">P&L Overview</TabsTrigger>
          <TabsTrigger value="clv">Customer LTV</TabsTrigger>
          <TabsTrigger value="staff-productivity">Staff Productivity</TabsTrigger>
          <TabsTrigger value="forecasting">Revenue Forecast</TabsTrigger>
          <TabsTrigger value="profit-margin">Profit Margin</TabsTrigger>
          <TabsTrigger value="cleaner-performance">Cleaner Performance</TabsTrigger>
          <TabsTrigger value="cleaner-availability">Availability</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Top Row - 2 Equal Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Revenue Bar Chart */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-4 h-[380px]">
              <h3 className="font-semibold mb-4">Monthly Revenue</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                    />
                    <Bar dataKey="revenue" fill="hsl(221, 83%, 53%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Revenue by Service Pie Chart */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-4 h-[380px]">
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

          {/* Second Row - Profit by Service + Staff Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Profit by Service */}
            <ProfitByServiceChart bookings={bookings} />

            {/* Staff Performance Table */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-4 h-[420px] overflow-auto">
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
                        <th className="pb-3 font-medium text-muted-foreground text-right">Completed</th>
                        <th className="pb-3 font-medium text-muted-foreground text-right">Upcoming</th>
                        <th className="pb-3 font-medium text-muted-foreground text-right">Total Payment</th>
                        <th className="pb-3 font-medium text-muted-foreground text-right">Avg/Booking</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffStats.map((staffMember, index) => (
                        <tr key={staffMember.name} className="border-b border-border/50 last:border-0">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                              <span className="font-medium">{maskName(staffMember.name)}</span>
                            </div>
                          </td>
                          <td className="py-3 text-right">{isTestMode ? 'X' : staffMember.bookings}</td>
                          <td className="py-3 text-right">
                            <span className="px-2 py-1 rounded-full text-xs bg-info/10 text-info">
                              {isTestMode ? 'X' : staffMember.upcomingCleans}
                            </span>
                          </td>
                          <td className="py-3 text-right font-semibold text-success">
                            {isTestMode ? '$XXX' : `$${staffMember.payment.toLocaleString()}`}
                          </td>
                          <td className="py-3 text-right">
                            {isTestMode ? '$XX' : `$${staffMember.bookings > 0 ? (staffMember.payment / staffMember.bookings).toFixed(0) : 0}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pnl">
          <PnLOverview bookings={bookings} customers={customers} />
        </TabsContent>

        <TabsContent value="clv">
          <CustomerLifetimeValue bookings={bookings} customers={customers} />
        </TabsContent>

        <TabsContent value="staff-productivity">
          <StaffProductivityMetrics bookings={bookings} staff={staff} />
        </TabsContent>

        <TabsContent value="forecasting">
          <RevenueForecasting bookings={bookings} recurringBookings={recurringBookings} />
        </TabsContent>

        <TabsContent value="profit-margin">
          <ProfitMarginReport bookings={bookings} />
        </TabsContent>

        <TabsContent value="cleaner-performance">
          <CleanerPerformanceDashboard bookings={bookings} staff={staff} />
        </TabsContent>

        <TabsContent value="cleaner-availability">
          <CleanerAvailabilityDashboard 
            bookings={bookings} 
            staff={staff} 
            workingHours={workingHours}
          />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}