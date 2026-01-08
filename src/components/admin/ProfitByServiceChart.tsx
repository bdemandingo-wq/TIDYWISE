import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { BookingWithDetails } from '@/hooks/useBookings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp } from 'lucide-react';

interface ProfitByServiceChartProps {
  bookings: BookingWithDetails[];
}

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#f97316'];

export function ProfitByServiceChart({ bookings }: ProfitByServiceChartProps) {
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
        
        let cleanerPay = 0;
        if (bookingAny.cleaner_actual_payment) {
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
  }, [bookings]);

  const totalProfit = serviceData.reduce((sum, s) => sum + s.profit, 0);

  const pieData = serviceData.map(s => ({
    name: s.name,
    value: s.profit,
    percentage: totalProfit > 0 ? (s.profit / totalProfit) * 100 : 0,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
          <p className="font-medium text-foreground">{data.name}</p>
          <p className="text-sm text-emerald-600">
            Profit: ${data.value?.toLocaleString() || data.profit?.toLocaleString()}
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
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
                            <p className="text-sm text-emerald-600 font-medium">
                              Profit: ${data.profit.toLocaleString()}
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
                  <Bar dataKey="profit" fill="hsl(142, 71%, 45%)" radius={[0, 4, 4, 0]} />
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
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{service.name}</p>
                  <p className="text-xs text-muted-foreground">
                    ${service.profit.toLocaleString()} ({service.marginPercent.toFixed(0)}%)
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
