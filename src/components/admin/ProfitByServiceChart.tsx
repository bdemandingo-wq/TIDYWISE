import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { BookingWithDetails } from '@/hooks/useBookings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useOrgId } from '@/hooks/useOrgId';

interface ProfitByServiceChartProps {
  bookings: BookingWithDetails[];
}

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#f97316'];
const REFUND_COLOR = '#ef4444'; // Red for refunds

export function ProfitByServiceChart({ bookings }: ProfitByServiceChartProps) {
  const { organizationId } = useOrgId();

  const completedBookingIds = useMemo(() => {
    return bookings
      .filter((b) => b.status === 'completed')
      .map((b) => b.id);
  }, [bookings]);

  // Fetch team assignment pay_share for accurate labor cost
  const { data: teamPaysByBooking = new Map<string, number>() } = useQuery({
    queryKey: ['profit-service-team-pay', organizationId, completedBookingIds.join(',')],
    queryFn: async () => {
      if (!organizationId || completedBookingIds.length === 0) return new Map<string, number>();

      const { data, error } = await supabase
        .from('booking_team_assignments')
        .select('booking_id, pay_share, staff_id')
        .eq('organization_id', organizationId)
        .in('booking_id', completedBookingIds);
      if (error) throw error;

      const bookingTeamMap = new Map<string, any[]>();
      for (const row of data || []) {
        const bid = String((row as any).booking_id);
        if (!bookingTeamMap.has(bid)) bookingTeamMap.set(bid, []);
        bookingTeamMap.get(bid)!.push(row);
      }

      const map = new Map<string, number>();
      for (const [bid, members] of bookingTeamMap) {
        let totalPay = 0;
        let hasAnyPay = false;
        for (const m of members) {
          const payShare = Number((m as any).pay_share);
          if (Number.isFinite(payShare) && payShare > 0) {
            totalPay += payShare;
            hasAnyPay = true;
          }
        }
        if (hasAnyPay) {
          map.set(bid, totalPay);
        }
      }
      return map;
    },
    enabled: !!organizationId && completedBookingIds.length > 0,
    staleTime: 1000 * 60 * 10,
  });

  const serviceData = useMemo(() => {
    const serviceMap = new Map<string, { 
      name: string; 
      revenue: number; 
      cleanerPay: number; 
      profit: number; 
      count: number;
    }>();

    bookings
      .filter(b => b.status === 'completed')
      .forEach(booking => {
        const serviceName = booking.service?.name || 'Refund';
        const revenue = Number(booking.total_amount || 0);
        const bookingAny = booking as any;
        
        // Use team pay_share if available, then fall back to individual wage
        const teamPay = teamPaysByBooking.get(booking.id);
        let cleanerPay = 0;
        if (teamPay != null && teamPay > 0) {
          cleanerPay = teamPay;
        } else if (bookingAny.cleaner_actual_payment != null && Number(bookingAny.cleaner_actual_payment) > 0) {
          cleanerPay = Number(bookingAny.cleaner_actual_payment);
        } else if (bookingAny.cleaner_wage) {
          const wage = Number(bookingAny.cleaner_wage);
          const wageType = bookingAny.cleaner_wage_type || 'hourly';
          
          if (wageType === 'flat') {
            cleanerPay = wage;
          } else if (wageType === 'percentage') {
            cleanerPay = (revenue * wage) / 100;
          } else {
            const hours = bookingAny.cleaner_override_hours || (booking.duration / 60);
            cleanerPay = wage * hours;
          }
        }

        const existing = serviceMap.get(serviceName) || { 
          name: serviceName, 
          revenue: 0, 
          cleanerPay: 0, 
          profit: 0, 
          count: 0 
        };
        
        existing.revenue += revenue;
        existing.cleanerPay += cleanerPay;
        existing.profit += (revenue - cleanerPay);
        existing.count += 1;
        
        serviceMap.set(serviceName, existing);
      });

    return Array.from(serviceMap.values())
      .map(service => ({
        ...service,
        marginPercent: service.revenue > 0 ? (service.profit / service.revenue) * 100 : 0,
        avgProfit: service.count > 0 ? service.profit / service.count : 0,
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [bookings, teamPaysByBooking]);

  const totalProfit = serviceData.reduce((sum, s) => sum + s.profit, 0);

  const pieData = serviceData.map(s => ({
    name: s.name,
    value: Math.abs(s.profit), // Use absolute for pie chart slice size
    actualValue: s.profit, // Keep actual for display
    percentage: totalProfit !== 0 ? (s.profit / Math.abs(totalProfit)) * 100 : 0,
    isRefund: s.name === 'Refund',
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const displayValue = data.actualValue ?? data.profit ?? data.value;
      const isNegative = displayValue < 0;
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
          <p className="font-medium text-foreground">{data.name}</p>
          <p className={cn("text-sm font-medium", isNegative ? "text-red-600" : "text-emerald-600")}>
            Profit: {isNegative ? '-' : ''}${Math.abs(displayValue)?.toLocaleString()}
          </p>
          {data.percentage !== undefined && (
            <p className="text-sm text-muted-foreground">
              {data.percentage.toFixed(1)}% of total
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  if (serviceData.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Profit by Service
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No completed bookings with profit data
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Profit by Service
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pie" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pie">Distribution</TabsTrigger>
            <TabsTrigger value="bar">Comparison</TabsTrigger>
          </TabsList>

          <TabsContent value="pie">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percentage }) => `${name} (${percentage.toFixed(0)}%)`}
                    labelLine={false}
                  >
                  {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.isRefund ? REFUND_COLOR : COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="bar">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serviceData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
                            <p className="font-medium text-foreground">{data.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Revenue: ${data.revenue.toLocaleString()}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Cleaner Pay: ${data.cleanerPay.toLocaleString()}
                            </p>
                            <p className={cn("text-sm font-medium", data.profit < 0 ? "text-red-600" : "text-emerald-600")}>
                              Profit: {data.profit < 0 ? '-' : ''}${Math.abs(data.profit).toLocaleString()}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Margin: {data.marginPercent.toFixed(1)}%
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar 
                    dataKey="profit" 
                    radius={[0, 4, 4, 0]}
                    fill="hsl(142, 71%, 45%)"
                  >
                    {serviceData.map((entry, index) => (
                      <Cell 
                        key={`bar-${index}`} 
                        fill={entry.name === 'Refund' || entry.profit < 0 ? '#ef4444' : 'hsl(142, 71%, 45%)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>

        {/* Summary Table */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {serviceData.slice(0, 4).map((service, idx) => (
              <div key={service.name} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: service.name === 'Refund' ? REFUND_COLOR : COLORS[idx % COLORS.length] }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{service.name}</p>
                  <p className={cn("text-xs", service.profit < 0 ? "text-red-600" : "text-muted-foreground")}>
                    {service.profit < 0 ? '-' : ''}${Math.abs(service.profit).toLocaleString()} ({service.marginPercent.toFixed(0)}%)
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
