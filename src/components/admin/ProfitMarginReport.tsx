import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TrendingUp, TrendingDown, DollarSign, Percent, CalendarIcon, Download } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { BookingWithDetails } from '@/hooks/useBookings';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';
import { useTestMode } from '@/contexts/TestModeContext';

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
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(subMonths(new Date(), 2)),
    to: endOfMonth(new Date()),
  });
  const { isTestMode, maskName, maskAmount } = useTestMode();

  const profitData = useMemo(() => {
    return bookings
      .map((booking): BookingProfit => {
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
        
        const profit = revenue - cleanerPay;
        const marginPercent = revenue > 0 ? (profit / revenue) * 100 : 0;
        
        return {
          id: booking.id,
          bookingNumber: booking.booking_number,
          customerName: booking.customer 
            ? `${booking.customer.first_name} ${booking.customer.last_name}`
            : 'Unknown',
          serviceName: booking.service?.name || 'Refund',
          scheduledAt: new Date(booking.scheduled_at),
          revenue,
          cleanerPay,
          profit,
          marginPercent,
          status: booking.status,
        };
      })
      .filter(b => {
        if (b.status !== 'completed') return false;
        if (!dateRange?.from) return true;
        
        const interval = {
          start: dateRange.from,
          end: dateRange.to || dateRange.from,
        };
        return isWithinInterval(b.scheduledAt, interval);
      })
      .sort((a, b) => b.marginPercent - a.marginPercent);
  }, [bookings, dateRange]);

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

  const exportToCSV = () => {
    const headers = ['Booking #', 'Date', 'Customer', 'Service', 'Revenue', 'Cleaner Pay', 'Profit', 'Margin %'];
    const rows = profitData.map(item => [
      item.bookingNumber,
      format(item.scheduledAt, 'yyyy-MM-dd'),
      item.customerName,
      item.serviceName,
      item.revenue.toFixed(2),
      item.cleanerPay.toFixed(2),
      item.profit.toFixed(2),
      item.marginPercent.toFixed(1),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `profit-margin-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <CalendarIcon className="w-4 h-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, 'MMM d, yyyy')} - {format(dateRange.to, 'MMM d, yyyy')}
                  </>
                ) : (
                  format(dateRange.from, 'MMM d, yyyy')
                )
              ) : (
                'Select date range'
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={setDateRange}
              numberOfMonths={2}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Button variant="outline" onClick={exportToCSV} className="gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold text-foreground">{isTestMode ? '$XXX' : `$${summaryStats.totalRevenue.toLocaleString()}`}</p>
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
                <p className="text-2xl font-bold text-foreground">{isTestMode ? '$XXX' : `$${summaryStats.totalCleanerPay.toLocaleString()}`}</p>
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
                <p className="text-2xl font-bold text-foreground">{isTestMode ? '$XXX' : `$${summaryStats.totalProfit.toLocaleString()}`}</p>
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
              <p className="text-sm text-muted-foreground">{maskName(summaryStats.mostProfitable.customerName)}</p>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-lg font-bold text-emerald-600">{isTestMode ? 'XX.X%' : `${summaryStats.mostProfitable.marginPercent.toFixed(1)}%`}</span>
                <span className="text-sm text-muted-foreground">margin</span>
                <span className="text-sm text-foreground">{maskAmount(summaryStats.mostProfitable.profit)}</span>
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
              <p className="text-sm text-muted-foreground">{maskName(summaryStats.leastProfitable.customerName)}</p>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-lg font-bold text-rose-600">{isTestMode ? 'XX.X%' : `${summaryStats.leastProfitable.marginPercent.toFixed(1)}%`}</span>
                <span className="text-sm text-muted-foreground">margin</span>
                <span className="text-sm text-foreground">{maskAmount(summaryStats.leastProfitable.profit)}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detailed Table */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Profit by Booking ({profitData.length} jobs)</CardTitle>
        </CardHeader>
        <CardContent>
          {profitData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No completed bookings with wage data in selected date range
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
                      <TableCell>{maskName(item.customerName)}</TableCell>
                      <TableCell>{item.serviceName}</TableCell>
                      <TableCell className="text-right">{maskAmount(item.revenue)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{maskAmount(item.cleanerPay)}</TableCell>
                      <TableCell className={cn("text-right font-semibold", getMarginColor(item.marginPercent))}>
                        {maskAmount(item.profit)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className={cn("font-medium", badge.variant)}>
                          {isTestMode ? 'XX.X%' : `${item.marginPercent.toFixed(1)}%`}
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