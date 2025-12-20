import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';
import { format } from 'date-fns';
import { BookingWithDetails } from '@/hooks/useBookings';
import { cn } from '@/lib/utils';

interface ProfitMarginReportProps {
  bookings: BookingWithDetails[];
}

interface BookingProfit {
  id: string;
  bookingNumber: number;
  customerName: string;
  serviceName: string;
  scheduledAt: Date;
  revenue: number;
  cleanerPay: number;
  profit: number;
  marginPercent: number;
  status: string;
}

export function ProfitMarginReport({ bookings }: ProfitMarginReportProps) {
  const profitData = useMemo(() => {
    return bookings
      .map((booking): BookingProfit => {
        const revenue = Number(booking.total_amount || 0);
        const bookingAny = booking as any;
        
        // Calculate cleaner pay based on wage type
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
            // hourly
            const hours = bookingAny.cleaner_override_hours || (booking.duration / 60);
            cleanerPay = wage * hours;
          }
        }
        
        const profit = revenue - cleanerPay;
        const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;
        
        return {
          id: booking.id,
          bookingNumber: booking.booking_number,
          customerName: booking.customer 
            ? `${booking.customer.first_name} ${booking.customer.last_name}`
            : 'Unknown',
          serviceName: booking.service?.name || 'Unknown',
          scheduledAt: new Date(booking.scheduled_at),
          revenue,
          cleanerPay,
          profit,
          marginPercent,
          status: booking.status,
        };
      })
      .filter(b => b.status === 'completed')
      .sort((a, b) => b.marginPercent - a.marginPercent);
  }, [bookings]);

  const summaryStats = useMemo(() => {
    const totalRevenue = profitData.reduce((sum, b) => sum + b.revenue, 0);
    const totalCleanerPay = profitData.reduce((sum, b) => sum + b.cleanerPay, 0);
    const totalProfit = totalRevenue - totalCleanerPay;
    const avgMargin = profitData.length > 0 
      ? profitData.reduce((sum, b) => sum + b.marginPercent, 0) / profitData.length 
      : 0;
    const mostProfitable = profitData[0];
    const leastProfitable = profitData[profitData.length - 1];

    return {
      totalRevenue,
      totalCleanerPay,
      totalProfit,
      avgMargin,
      mostProfitable,
      leastProfitable,
      totalJobs: profitData.length,
    };
  }, [profitData]);

  const getMarginColor = (margin: number) => {
    if (margin >= 50) return 'text-emerald-600 dark:text-emerald-400';
    if (margin >= 30) return 'text-blue-600 dark:text-blue-400';
    if (margin >= 15) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  const getMarginBadge = (margin: number) => {
    if (margin >= 50) return { label: 'Excellent', variant: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
    if (margin >= 30) return { label: 'Good', variant: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' };
    if (margin >= 15) return { label: 'Fair', variant: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
    return { label: 'Low', variant: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' };
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold text-foreground">${summaryStats.totalRevenue.toLocaleString()}</p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Cleaner Pay</p>
                <p className="text-2xl font-bold text-foreground">${summaryStats.totalCleanerPay.toLocaleString()}</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className="text-2xl font-bold text-foreground">${summaryStats.totalProfit.toLocaleString()}</p>
              </div>
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Margin</p>
                <p className={cn("text-2xl font-bold", getMarginColor(summaryStats.avgMargin))}>
                  {summaryStats.avgMargin.toFixed(1)}%
                </p>
              </div>
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Percent className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Most/Least Profitable */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summaryStats.mostProfitable && (
          <Card className="border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50/50 to-transparent dark:from-emerald-900/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Most Profitable Job
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{summaryStats.mostProfitable.serviceName}</p>
              <p className="text-sm text-muted-foreground">{summaryStats.mostProfitable.customerName}</p>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-lg font-bold text-emerald-600">{summaryStats.mostProfitable.marginPercent.toFixed(1)}%</span>
                <span className="text-sm text-muted-foreground">margin</span>
                <span className="text-sm text-foreground">${summaryStats.mostProfitable.profit.toFixed(2)} profit</span>
              </div>
            </CardContent>
          </Card>
        )}
        
        {summaryStats.leastProfitable && summaryStats.totalJobs > 1 && (
          <Card className="border-rose-200 dark:border-rose-800 bg-gradient-to-br from-rose-50/50 to-transparent dark:from-rose-900/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-600" />
                Least Profitable Job
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{summaryStats.leastProfitable.serviceName}</p>
              <p className="text-sm text-muted-foreground">{summaryStats.leastProfitable.customerName}</p>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-lg font-bold text-rose-600">{summaryStats.leastProfitable.marginPercent.toFixed(1)}%</span>
                <span className="text-sm text-muted-foreground">margin</span>
                <span className="text-sm text-foreground">${summaryStats.leastProfitable.profit.toFixed(2)} profit</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detailed Table */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Profit by Booking</CardTitle>
        </CardHeader>
        <CardContent>
          {profitData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No completed bookings with wage data available
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cleaner Pay</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profitData.map((item) => {
                  const badge = getMarginBadge(item.marginPercent);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">#{item.bookingNumber}</TableCell>
                      <TableCell>{format(item.scheduledAt, 'MMM d, yyyy')}</TableCell>
                      <TableCell>{item.customerName}</TableCell>
                      <TableCell>{item.serviceName}</TableCell>
                      <TableCell className="text-right">${item.revenue.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">${item.cleanerPay.toFixed(2)}</TableCell>
                      <TableCell className={cn("text-right font-semibold", getMarginColor(item.marginPercent))}>
                        ${item.profit.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className={cn("font-medium", badge.variant)}>
                          {item.marginPercent.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
