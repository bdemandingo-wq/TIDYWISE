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
import { calculateBookingWage, type WageBooking, type WageStaff } from '@/lib/wageCalculation';

interface Props {
  staffId: string;
  staffName: string;
}

interface Booking extends WageBooking {
  id: string;
  booking_number: number;
  scheduled_at: string;
  status: string;
  service: { name: string } | null;
  customer: { first_name: string; last_name: string } | null;
}

interface TeamAssignment {
  booking_id: string;
  staff_id: string;
  pay_share: number | null;
  is_primary: boolean | null;
}

/**
 * Unified pay resolver — mirrors PayrollPage.calcWage exactly.
 * Priority:
 *  1. pay_share on team assignment (per-person adjusted pay for team bookings)
 *  2. cleaner_actual_payment on booking (single-cleaner adjusted pay)
 *  3. standard wage formula (hourly / flat / percentage)
 */
function resolveEarnings(
  booking: Booking,
  staffInfo: WageStaff | undefined | null,
  payShare: number | null | undefined,
) {
  const base = calculateBookingWage(booking, staffInfo);

  if (payShare != null) {
    return { calculatedPay: Number(payShare), hoursWorked: base.hoursWorked };
  }
  if (booking.cleaner_actual_payment != null) {
    return { calculatedPay: Number(booking.cleaner_actual_payment), hoursWorked: base.hoursWorked };
  }
  return { calculatedPay: base.calculatedPay, hoursWorked: base.hoursWorked };
}

export function CleanerEarnings({ staffId, staffName }: Props) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  // Fetch staff member's wage info
  const { data: staffInfo } = useQuery({
    queryKey: ['cleaner-wage-info', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('base_wage, hourly_rate, default_hours')
        .eq('id', staffId)
        .single();
      if (error) throw error;
      return data as WageStaff;
    },
    enabled: !!staffId,
  });

  // Build date range bounds
  const fromISO = dateRange?.from?.toISOString();
  const toEndOfDay = dateRange?.to ? new Date(dateRange.to) : null;
  if (toEndOfDay) toEndOfDay.setHours(23, 59, 59, 999);
  const toISO = toEndOfDay?.toISOString();

  // 1. Fetch completed bookings where this staff is the PRIMARY cleaner
  const { data: primaryBookings = [], isLoading: loadingPrimary } = useQuery({
    queryKey: ['cleaner-earnings-primary', staffId, dateRange],
    queryFn: async () => {
      let query = supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, total_amount,
          cleaner_actual_payment, cleaner_wage, cleaner_wage_type,
          cleaner_checkin_at, cleaner_checkout_at, cleaner_override_hours,
          service:services(name),
          customer:customers(first_name, last_name)
        `)
        .eq('staff_id', staffId)
        .eq('status', 'completed');
      if (fromISO) query = query.gte('scheduled_at', fromISO);
      if (toISO)   query = query.lte('scheduled_at', toISO);
      const { data, error } = await query.order('scheduled_at', { ascending: false });
      if (error) throw error;
      return data as Booking[];
    },
    enabled: !!staffId,
  });

  // 2. Fetch team assignments for this staff in the date range (catches team bookings where they aren't primary)
  const { data: teamAssignments = [], isLoading: loadingTeam } = useQuery({
    queryKey: ['cleaner-earnings-team', staffId, dateRange],
    queryFn: async () => {
      // First find all booking ids in range where this staff appears as a team member
      let bookingQuery = supabase
        .from('booking_team_assignments')
        .select('booking_id, staff_id, pay_share, is_primary')
        .eq('staff_id', staffId);
      const { data: assignments, error: aErr } = await bookingQuery;
      if (aErr) throw aErr;
      if (!assignments?.length) return [];

      // Fetch the actual bookings for those assignments that are completed + in date range
      const bookingIds = assignments.map((a) => a.booking_id);
      let bQuery = supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, total_amount,
          cleaner_actual_payment, cleaner_wage, cleaner_wage_type,
          cleaner_checkin_at, cleaner_checkout_at, cleaner_override_hours,
          staff_id,
          service:services(name),
          customer:customers(first_name, last_name)
        `)
        .in('id', bookingIds)
        .eq('status', 'completed');
      if (fromISO) bQuery = bQuery.gte('scheduled_at', fromISO);
      if (toISO)   bQuery = bQuery.lte('scheduled_at', toISO);
      const { data: bookings, error: bErr } = await bQuery.order('scheduled_at', { ascending: false });
      if (bErr) throw bErr;

      // Attach pay_share to each booking
      return (bookings || []).map((b: any) => {
        const a = assignments.find((x) => x.booking_id === b.id)!;
        return { booking: b as Booking, payShare: a.pay_share, isPrimary: a.is_primary };
      });
    },
    enabled: !!staffId,
  });

  // Merge: primary bookings + team bookings (de-duplicate by booking id)
  const allEntries = useMemo(() => {
    const entries: { booking: Booking; payShare: number | null }[] = [];
    const seen = new Set<string>();

    // Primary bookings: get their pay_share from team assignments if available
    for (const b of primaryBookings) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      const ta = teamAssignments.find((t) => t.booking.id === b.id);
      entries.push({ booking: b, payShare: ta?.payShare ?? null });
    }

    // Team bookings not already included as primary
    for (const t of teamAssignments) {
      if (seen.has(t.booking.id)) continue;
      seen.add(t.booking.id);
      entries.push({ booking: t.booking, payShare: t.payShare });
    }

    // Sort descending by date
    entries.sort((a, b) =>
      new Date(b.booking.scheduled_at).getTime() - new Date(a.booking.scheduled_at).getTime()
    );
    return entries;
  }, [primaryBookings, teamAssignments]);

  // Stats — uses same priority logic as PayrollPage
  const stats = useMemo(() => {
    let totalEarnings = 0;
    let totalHours = 0;
    for (const { booking, payShare } of allEntries) {
      const { calculatedPay, hoursWorked } = resolveEarnings(booking, staffInfo, payShare);
      totalEarnings += calculatedPay;
      totalHours += hoursWorked;
    }
    const totalJobs = allEntries.length;
    return {
      totalEarnings,
      totalJobs,
      avgPerJob: totalJobs > 0 ? totalEarnings / totalJobs : 0,
      totalHours,
      avgPerHour: totalHours > 0 ? totalEarnings / totalHours : 0,
    };
  }, [allEntries, staffInfo]);

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Date', 'Booking #', 'Service', 'Customer', 'Actual Hours', 'Total Job Amount', 'Your Earnings'];
    const rows = allEntries.map(({ booking, payShare }) => {
      const { calculatedPay, hoursWorked } = resolveEarnings(booking, staffInfo, payShare);
      return [
        format(new Date(booking.scheduled_at), 'yyyy-MM-dd'),
        booking.booking_number,
        booking.service?.name || 'N/A',
        booking.customer ? `${booking.customer.first_name} ${booking.customer.last_name}` : 'N/A',
        hoursWorked.toFixed(2),
        booking.total_amount.toFixed(2),
        calculatedPay.toFixed(2),
      ];
    });
    rows.push([]);
    rows.push(['Summary']);
    rows.push(['Total Jobs', stats.totalJobs.toString()]);
    rows.push(['Total Hours', stats.totalHours.toFixed(2)]);
    rows.push(['Total Earnings', stats.totalEarnings.toFixed(2)]);
    rows.push(['Average Per Job', stats.avgPerJob.toFixed(2)]);
    rows.push(['Average Per Hour', stats.avgPerHour.toFixed(2)]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
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
      case 'month':   from = startOfMonth(now); to = endOfMonth(now); break;
      case 'quarter': from = subMonths(startOfMonth(now), 2); break;
      case 'ytd':     from = startOfYear(now); break;
      case 'year':    from = subMonths(now, 12); break;
    }
    setDateRange({ from, to });
  };

  const isLoading = loadingPrimary || loadingTeam;

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
                  <>{format(dateRange.from, 'LLL dd, y')} - {format(dateRange.to, 'LLL dd, y')}</>
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

        <Button onClick={exportToCSV} disabled={allEntries.length === 0} className="ml-auto gap-2">
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
          <CardDescription>Detailed breakdown of your completed jobs and earnings</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : allEntries.length === 0 ? (
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
                  {allEntries.map(({ booking, payShare }) => {
                    const { calculatedPay, hoursWorked } = resolveEarnings(booking, staffInfo, payShare);
                    return (
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
                        <TableCell className="text-right">{hoursWorked.toFixed(1)}h</TableCell>
                        <TableCell className="text-right">${booking.total_amount.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          ${calculatedPay.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
