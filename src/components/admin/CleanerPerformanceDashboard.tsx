import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Star, TrendingUp, Clock, DollarSign, Calendar as CalendarIcon, CheckCircle, Download } from 'lucide-react';
import { isAfter, format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { BookingWithDetails } from '@/hooks/useBookings';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';

interface CleanerPerformanceDashboardProps {
  bookings: BookingWithDetails[];
  staff: Array<{
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    avatar_url?: string | null;
    is_active: boolean;
    hourly_rate?: number | null;
    base_wage?: number | null;
  }>;
}

interface CleanerStats {
  id: string;
  name: string;
  avatarUrl?: string | null;
  totalBookings: number;
  completedBookings: number;
  upcomingBookings: number;
  cancelledBookings: number;
  noShowBookings: number;
  completionRate: number;
  totalRevenue: number;
  totalEarnings: number;
  avgRevenuePerJob: number;
  avgEarningsPerJob: number;
  periodBookings: number;
  periodEarnings: number;
}

export function CleanerPerformanceDashboard({ bookings, staff }: CleanerPerformanceDashboardProps) {
  const now = new Date();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(subMonths(new Date(), 2)),
    to: endOfMonth(new Date()),
  });

  const cleanerStats = useMemo(() => {
    return staff
      .filter(s => s.is_active)
      .map((cleaner): CleanerStats => {
        const cleanerBookings = bookings.filter(b => b.staff?.id === cleaner.id);
        
        // Filter by date range for period stats
        const periodBookings = cleanerBookings.filter(b => {
          if (!dateRange?.from) return true;
          const bookingDate = new Date(b.scheduled_at);
          const interval = {
            start: dateRange.from,
            end: dateRange.to || dateRange.from,
          };
          return isWithinInterval(bookingDate, interval);
        });
        
        const completedBookings = periodBookings.filter(b => b.status === 'completed');
        const upcomingBookings = cleanerBookings.filter(b => 
          isAfter(new Date(b.scheduled_at), now) && 
          !['completed', 'cancelled', 'no_show'].includes(b.status)
        );
        const cancelledBookings = periodBookings.filter(b => b.status === 'cancelled');
        const noShowBookings = periodBookings.filter(b => b.status === 'no_show');
        
        const totalRevenue = completedBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
        const totalEarnings = completedBookings.reduce((sum, b) => {
          return sum + Number((b as any).cleaner_actual_payment || 0);
        }, 0);
        
        const completionRate = periodBookings.length > 0 
          ? (completedBookings.length / (completedBookings.length + cancelledBookings.length + noShowBookings.length)) * 100
          : 0;
        
        return {
          id: cleaner.id,
          name: cleaner.name,
          avatarUrl: cleaner.avatar_url,
          totalBookings: cleanerBookings.length,
          completedBookings: completedBookings.length,
          upcomingBookings: upcomingBookings.length,
          cancelledBookings: cancelledBookings.length,
          noShowBookings: noShowBookings.length,
          completionRate: isNaN(completionRate) ? 0 : completionRate,
          totalRevenue,
          totalEarnings,
          avgRevenuePerJob: completedBookings.length > 0 ? totalRevenue / completedBookings.length : 0,
          avgEarningsPerJob: completedBookings.length > 0 ? totalEarnings / completedBookings.length : 0,
          periodBookings: completedBookings.length,
          periodEarnings: totalEarnings,
        };
      })
      .sort((a, b) => b.totalEarnings - a.totalEarnings);
  }, [bookings, staff, now, dateRange]);

  const topPerformer = cleanerStats[0];
  const totalTeamRevenue = cleanerStats.reduce((sum, c) => sum + c.totalRevenue, 0);
  const totalTeamEarnings = cleanerStats.reduce((sum, c) => sum + c.totalEarnings, 0);
  const avgCompletionRate = cleanerStats.length > 0
    ? cleanerStats.reduce((sum, c) => sum + c.completionRate, 0) / cleanerStats.length
    : 0;

  const getCompletionColor = (rate: number) => {
    if (rate >= 90) return 'text-emerald-600 dark:text-emerald-400';
    if (rate >= 75) return 'text-blue-600 dark:text-blue-400';
    if (rate >= 60) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  const getProgressColor = (rate: number) => {
    if (rate >= 90) return 'bg-emerald-500';
    if (rate >= 75) return 'bg-blue-500';
    if (rate >= 60) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const exportToCSV = () => {
    const headers = ['Cleaner', 'Completed Jobs', 'Upcoming', 'Cancelled', 'No Shows', 'Completion Rate', 'Total Earnings', 'Avg/Job'];
    const rows = cleanerStats.map(c => [
      c.name,
      c.completedBookings,
      c.upcomingBookings,
      c.cancelledBookings,
      c.noShowBookings,
      c.completionRate.toFixed(1) + '%',
      c.totalEarnings.toFixed(2),
      c.avgEarningsPerJob.toFixed(2),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cleaner-performance-${format(new Date(), 'yyyy-MM-dd')}.csv`;
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
                <p className="text-sm text-muted-foreground">Active Cleaners</p>
                <p className="text-2xl font-bold text-foreground">{cleanerStats.length}</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Star className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Team Revenue</p>
                <p className="text-2xl font-bold text-foreground">${totalTeamRevenue.toLocaleString()}</p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Paid Out</p>
                <p className="text-2xl font-bold text-foreground">${totalTeamEarnings.toLocaleString()}</p>
              </div>
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <DollarSign className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Completion</p>
                <p className={cn("text-2xl font-bold", getCompletionColor(avgCompletionRate))}>
                  {avgCompletionRate.toFixed(1)}%
                </p>
              </div>
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <CheckCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Performer */}
      {topPerformer && topPerformer.totalEarnings > 0 && (
        <Card className="border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-900/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500" />
              Top Performer This Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarImage src={topPerformer.avatarUrl || undefined} />
                <AvatarFallback className="bg-amber-100 text-amber-700">
                  {topPerformer.name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-semibold text-lg">{topPerformer.name}</p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{topPerformer.completedBookings} jobs completed</span>
                  <span className="text-amber-600 font-semibold">${topPerformer.totalEarnings.toLocaleString()} earned</span>
                </div>
              </div>
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
                {topPerformer.completionRate.toFixed(0)}% completion
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cleaner Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cleanerStats.map((cleaner) => (
          <Card key={cleaner.id} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3 mb-4">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={cleaner.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {cleaner.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{cleaner.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {cleaner.upcomingBookings} upcoming
                  </p>
                </div>
                <Badge className={cn(
                  "shrink-0",
                  cleaner.completionRate >= 90 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" :
                  cleaner.completionRate >= 75 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" :
                  cleaner.completionRate >= 60 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                )}>
                  {cleaner.completionRate.toFixed(0)}%
                </Badge>
              </div>

              {/* Completion Progress */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Completion Rate</span>
                  <span>{cleaner.completedBookings} of {cleaner.completedBookings + cleaner.cancelledBookings + cleaner.noShowBookings}</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full transition-all", getProgressColor(cleaner.completionRate))}
                    style={{ width: `${Math.min(cleaner.completionRate, 100)}%` }}
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <CheckCircle className="w-3 h-3" />
                    Completed
                  </div>
                  <p className="font-semibold">{cleaner.completedBookings}</p>
                </div>
                <div className="p-2 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <CalendarIcon className="w-3 h-3" />
                    In Period
                  </div>
                  <p className="font-semibold">{cleaner.periodBookings}</p>
                </div>
                <div className="p-2 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <DollarSign className="w-3 h-3" />
                    Total Earned
                  </div>
                  <p className="font-semibold text-emerald-600">${cleaner.totalEarnings.toLocaleString()}</p>
                </div>
                <div className="p-2 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Clock className="w-3 h-3" />
                    Avg/Job
                  </div>
                  <p className="font-semibold">${cleaner.avgEarningsPerJob.toFixed(0)}</p>
                </div>
              </div>

              {/* Issues */}
              {(cleaner.cancelledBookings > 0 || cleaner.noShowBookings > 0) && (
                <div className="mt-3 pt-3 border-t border-border/50 flex gap-2">
                  {cleaner.cancelledBookings > 0 && (
                    <Badge variant="outline" className="text-xs text-rose-600 border-rose-200">
                      {cleaner.cancelledBookings} cancelled
                    </Badge>
                  )}
                  {cleaner.noShowBookings > 0 && (
                    <Badge variant="outline" className="text-xs text-slate-600 border-slate-200">
                      {cleaner.noShowBookings} no-show
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {cleanerStats.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No active cleaners found
        </div>
      )}
    </div>
  );
}