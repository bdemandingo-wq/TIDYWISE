import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format, startOfMonth, endOfMonth, startOfYear, subMonths } from 'date-fns';
import { CalendarIcon, Download, DollarSign, TrendingUp, Briefcase, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

interface Props {
  staffId: string;
  staffName: string;
}

interface Booking {
  id: string;
  booking_number: number;
  scheduled_at: string;
  duration: number;
  status: string;
  total_amount: number;
  cleaner_actual_payment: number | null;
  cleaner_wage: number | null;
  cleaner_wage_type: string | null;
  service: { name: string } | null;
  customer: { first_name: string; last_name: string } | null;
}

export function CleanerEarnings({ staffId, staffName }: Props) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  // Fetch completed bookings for this cleaner
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['cleaner-earnings', staffId, dateRange],
    queryFn: async () => {
      let query = supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, total_amount,
          cleaner_actual_payment, cleaner_wage, cleaner_wage_type,
          service:services(name),
          customer:customers(first_name, last_name)
        `)
        .eq('staff_id', staffId)
        .eq('status', 'completed');

      if (dateRange?.from) {
        query = query.gte('scheduled_at', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        query = query.lte('scheduled_at', dateRange.to.toISOString());
      }

      const { data, error } = await query.order('scheduled_at', { ascending: false });
      if (error) throw error;
      return data as Booking[];
    },
    enabled: !!staffId,
  });

  // Calculate earnings
  const stats = useMemo(() => {
    const totalEarnings = bookings.reduce((sum, b) => {
      const payment = b.cleaner_actual_payment || 0;
      return sum + payment;
    }, 0);

    const totalJobs = bookings.length;
    const avgPerJob = totalJobs > 0 ? totalEarnings / totalJobs : 0;
    const totalHours = bookings.reduce((sum, b) => sum + (b.duration / 60), 0);
    const avgPerHour = totalHours > 0 ? totalEarnings / totalHours : 0;

    return {
      totalEarnings,
      totalJobs,
      avgPerJob,
      totalHours,
      avgPerHour,
    };
  }, [bookings]);

  // Export to CSV for taxes
  const exportToCSV = () => {
    const headers = ['Date', 'Booking #', 'Service', 'Customer', 'Duration (hrs)', 'Total Job Amount', 'Your Earnings'];
    const rows = bookings.map((b) => [
      format(new Date(b.scheduled_at), 'yyyy-MM-dd'),
      b.booking_number,
      b.service?.name || 'N/A',
      b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'N/A',
      (b.duration / 60).toFixed(2),
      b.total_amount.toFixed(2),
      (b.cleaner_actual_payment || 0).toFixed(2),
    ]);

    // Add summary row
    rows.push([]);
    rows.push(['Summary']);
    rows.push(['Total Jobs', stats.totalJobs.toString()]);
    rows.push(['Total Hours', stats.totalHours.toFixed(2)]);
    rows.push(['Total Earnings', stats.totalEarnings.toFixed(2)]);
    rows.push(['Average Per Job', stats.avgPerJob.toFixed(2)]);
    rows.push(['Average Per Hour', stats.avgPerHour.toFixed(2)]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `earnings-${staffName.replace(/\s+/g, '-')}-${format(dateRange?.from || new Date(), 'yyyy-MM-dd')}-to-${format(dateRange?.to || new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  // Quick date range presets
  const setPreset = (preset: 'month' | 'quarter' | 'ytd' | 'year') => {
    const now = new Date();
    let from: Date;
    let to: Date = now;

    switch (preset) {
      case 'month':
        from = startOfMonth(now);
        to = endOfMonth(now);
        break;
      case 'quarter':
        from = subMonths(startOfMonth(now), 2);
        break;
      case 'ytd':
        from = startOfYear(now);
        break;
      case 'year':
        from = subMonths(now, 12);
        break;
    }
    setDateRange({ from, to });
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn('justify-start text-left font-normal', !dateRange && 'text-muted-foreground')}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, 'LLL dd, y')} - {format(dateRange.to, 'LLL dd, y')}
                  </>
                ) : (
                  format(dateRange.from, 'LLL dd, y')
                )
              ) : (
                <span>Pick a date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={setDateRange}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreset('month')}>This Month</Button>
          <Button variant="outline" size="sm" onClick={() => setPreset('quarter')}>Last 3 Months</Button>
          <Button variant="outline" size="sm" onClick={() => setPreset('ytd')}>Year to Date</Button>
        </div>

        <Button onClick={exportToCSV} disabled={bookings.length === 0} className="ml-auto gap-2">
          <Download className="h-4 w-4" />
          Export for Taxes
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Earnings</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              ${stats.totalEarnings.toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Jobs Completed</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-blue-500" />
              {stats.totalJobs}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Per Job</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              ${stats.avgPerJob.toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Hours</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <FileText className="h-5 w-5 text-orange-500" />
              {stats.totalHours.toFixed(1)}h
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Earnings Table */}
      <Card>
        <CardHeader>
          <CardTitle>Earnings History</CardTitle>
          <CardDescription>
            Detailed breakdown of your completed jobs and earnings
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : bookings.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No completed jobs in this date range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Booking #</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="text-right">Job Total</TableHead>
                    <TableHead className="text-right">Your Earnings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell>{format(new Date(booking.scheduled_at), 'MMM d, yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant="outline">#{booking.booking_number}</Badge>
                      </TableCell>
                      <TableCell>{booking.service?.name || 'N/A'}</TableCell>
                      <TableCell>
                        {booking.customer
                          ? `${booking.customer.first_name} ${booking.customer.last_name}`
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">{(booking.duration / 60).toFixed(1)}h</TableCell>
                      <TableCell className="text-right">${booking.total_amount.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        ${(booking.cleaner_actual_payment || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
