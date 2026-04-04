import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, CalendarIcon } from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  startOfYear,
  endOfYear,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';

interface DailyPnL {
  revenue: number;
  expenses: number;
  cleanerPay: number;
  fees: number;
  net: number;
}

const formatAmount = (amount: number, showSign = true): string => {
  const abs = Math.abs(amount);
  if (abs >= 1000) {
    return `${showSign ? (amount >= 0 ? '+' : '-') : (amount < 0 ? '-' : '')}$${(abs / 1000).toFixed(2)}K`;
  }
  return `${showSign ? (amount >= 0 ? '+' : '-') : (amount < 0 ? '-' : '')}$${abs.toFixed(2)}`;
};

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

type MetricMode = 'revenue' | 'profit';

export function PnLCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const [metricMode, setMetricMode] = useState<MetricMode>('revenue');
  const { isTestMode } = useTestMode();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { timezone } = useOrgTimezone();

  // Determine the query date range based on view mode
  const queryRange = useMemo(() => {
    if (viewMode === 'year') {
      return {
        from: startOfYear(currentMonth).toISOString(),
        to: endOfYear(currentMonth).toISOString(),
      };
    }
    // For month view, fetch current month's full calendar range (includes overflow days)
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return {
      from: calStart.toISOString(),
      to: calEnd.toISOString(),
    };
  }, [currentMonth, viewMode]);

  // Self-contained bookings query
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ['pnl-calendar-bookings', organizationId, queryRange.from, queryRange.to],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('id, scheduled_at, total_amount, status, payment_status, cleaner_pay_expected, cleaner_actual_payment, cleaner_wage, cleaner_wage_type, cleaner_override_hours, duration')
        .eq('organization_id', organizationId)
        .gte('scheduled_at', queryRange.from)
        .lte('scheduled_at', queryRange.to)
        .neq('status', 'cancelled');
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch team pay
  const bookingIds = useMemo(() => bookings.map((b: any) => b.id), [bookings]);
  const { data: teamPaysByBooking = new Map<string, number>() } = useQuery({
    queryKey: ['pnl-calendar-team-pay', organizationId, bookingIds.join(',')],
    queryFn: async () => {
      if (!organizationId || bookingIds.length === 0) return new Map<string, number>();
      const { data, error } = await supabase
        .from('booking_team_assignments')
        .select('booking_id, pay_share')
        .eq('organization_id', organizationId)
        .in('booking_id', bookingIds);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of data || []) {
        const bid = String((row as any).booking_id);
        const share = Number((row as any).pay_share);
        if (Number.isFinite(share) && share > 0) {
          map.set(bid, (map.get(bid) || 0) + share);
        }
      }
      return map;
    },
    enabled: !!organizationId && bookingIds.length > 0,
  });

  // Fetch expenses
  const { data: expenses = [] } = useQuery({
    queryKey: ['pnl-calendar-expenses', organizationId, queryRange.from, queryRange.to],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('expense_date', queryRange.from.substring(0, 10))
        .lte('expense_date', queryRange.to.substring(0, 10));
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const isLoading = bookingsLoading;

  // Calculate daily P&L from bookings and expenses
  const dailyPnL = useMemo(() => {
    const map = new Map<string, DailyPnL>();
    const seenBookingIds = new Set<string>();

    bookings.forEach((b: any) => {
      if (b.payment_status === 'refunded') return;
      if (b.payment_status !== 'paid' && b.payment_status !== 'partial') return;
      if (seenBookingIds.has(b.id)) return;
      seenBookingIds.add(b.id);

      // Convert scheduled_at to org timezone for date grouping
      const scheduledDate = new Date(b.scheduled_at);
      let dateKey: string;
      try {
        dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(scheduledDate);
      } catch {
        dateKey = format(scheduledDate, 'yyyy-MM-dd');
      }

      const existing = map.get(dateKey) || { revenue: 0, expenses: 0, cleanerPay: 0, fees: 0, net: 0 };

      const gross = Number(b.total_amount) || 0;
      const fee = (gross * 0.029) + 0.30;

      let cleanerPay = 0;
      const teamPay = teamPaysByBooking.get(b.id);
      if (teamPay != null && teamPay > 0) {
        cleanerPay = teamPay;
      } else if (b.cleaner_pay_expected != null && Number(b.cleaner_pay_expected) > 0) {
        cleanerPay = Number(b.cleaner_pay_expected);
      } else if (b.cleaner_actual_payment != null && Number(b.cleaner_actual_payment) > 0) {
        cleanerPay = Number(b.cleaner_actual_payment);
      } else if (b.cleaner_wage) {
        const wage = Number(b.cleaner_wage);
        const wageType = b.cleaner_wage_type || 'hourly';
        if (wageType === 'flat') cleanerPay = wage;
        else if (wageType === 'percentage') cleanerPay = (gross * wage) / 100;
        else cleanerPay = wage * (b.cleaner_override_hours || (b.duration / 60));
      }

      existing.revenue += gross;
      existing.fees += fee;
      existing.cleanerPay += cleanerPay;
      existing.net = existing.revenue - existing.fees - existing.cleanerPay - existing.expenses;
      map.set(dateKey, existing);
    });

    expenses.forEach((e: any) => {
      const dateKey = e.expense_date;
      if (!dateKey) return;
      const existing = map.get(dateKey) || { revenue: 0, expenses: 0, cleanerPay: 0, fees: 0, net: 0 };
      existing.expenses += Number(e.amount) || 0;
      existing.net = existing.revenue - existing.fees - existing.cleanerPay - existing.expenses;
      map.set(dateKey, existing);
    });

    return map;
  }, [bookings, expenses, teamPaysByBooking, timezone]);

  // Helper: get the displayed value for a day based on metric mode
  const getDayValue = (pnl: DailyPnL | undefined): number => {
    if (!pnl) return 0;
    if (metricMode === 'revenue') return pnl.revenue;
    // Profit = Client Pay − Cleaner Pay (no fees, no expenses)
    return pnl.revenue - pnl.cleanerPay;
  };

  // Monthly totals for year view
  const monthlyTotals = useMemo(() => {
    const map = new Map<string, number>();
    dailyPnL.forEach((val, dateKey) => {
      const monthKey = dateKey.substring(0, 7);
      const dayValue = getDayValue(val);
      map.set(monthKey, (map.get(monthKey) || 0) + dayValue);
    });
    return map;
  }, [dailyPnL, metricMode]);

  // Generate calendar days (Monday start)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  const navigateMonth = (dir: 'prev' | 'next') => {
    setCurrentMonth(prev => dir === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
    setViewMode('month');
  };

  const currentYear = currentMonth.getFullYear();

  // Monthly total for header
  const monthTotal = useMemo(() => {
    let total = 0;
    const monthKey = format(currentMonth, 'yyyy-MM');
    dailyPnL.forEach((val, dateKey) => {
      if (dateKey.startsWith(monthKey)) total += getDayValue(val);
    });
    return total;
  }, [dailyPnL, currentMonth, metricMode]);

  const getValueColor = (value: number, hasData: boolean) => {
    if (!hasData) return 'text-muted-foreground/50';
    if (metricMode === 'revenue') return 'text-emerald-500';
    if (value < 0) return 'text-destructive';
    if (value === 0) return 'text-muted-foreground';
    return 'text-emerald-500';
  };

  const getCellBg = (value: number, hasData: boolean) => {
    if (!hasData) return 'border-transparent';
    if (metricMode === 'revenue') return 'bg-emerald-500/10 border-emerald-500/30';
    if (value < 0) return 'bg-destructive/10 border-destructive/30';
    if (value === 0) return 'border-border';
    return 'bg-emerald-500/10 border-emerald-500/30';
  };

  return (
    <Card className="bg-[hsl(var(--card))] border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg font-bold">P&L Calendar</CardTitle>
          <div className="flex items-center gap-2">
            {/* Today button */}
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={goToToday}>
              <CalendarIcon className="h-3 w-3" />
              Today
            </Button>

            {/* Revenue / Profit toggle */}
            <ToggleGroup
              type="single"
              value={metricMode}
              onValueChange={(v) => v && setMetricMode(v as MetricMode)}
              className="bg-muted rounded-lg p-0.5"
            >
              <ToggleGroupItem value="revenue" className="text-xs px-3 h-7 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md">
                Revenue
              </ToggleGroupItem>
              <ToggleGroupItem value="profit" className="text-xs px-3 h-7 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md">
                Profit
              </ToggleGroupItem>
            </ToggleGroup>

            {/* Month / Year toggle */}
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(v) => v && setViewMode(v as 'month' | 'year')}
              className="bg-muted rounded-lg p-0.5"
            >
              <ToggleGroupItem value="month" className="text-xs px-3 h-7 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md">
                Month
              </ToggleGroupItem>
              <ToggleGroupItem value="year" className="text-xs px-3 h-7 data-[state=on]:bg-background data-[state=on]:shadow-sm rounded-md">
                Year
              </ToggleGroupItem>
            </ToggleGroup>

            <Select
              value={format(currentMonth, 'yyyy-MM')}
              onValueChange={(v) => setCurrentMonth(new Date(v + '-01'))}
            >
              <SelectTrigger className="w-[120px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => {
                  const d = new Date(currentYear, i, 1);
                  return (
                    <SelectItem key={i} value={format(d, 'yyyy-MM')}>
                      {format(d, 'MMM yyyy')}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Month navigation */}
        {viewMode === 'month' && (
          <div className="flex items-center justify-between mt-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateMonth('prev')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <span className="text-sm font-medium">{format(currentMonth, 'MMMM yyyy')}</span>
              {!isTestMode && !isLoading && (
                <span className={cn(
                  "ml-2 text-sm font-bold",
                  getValueColor(monthTotal, monthTotal !== 0)
                )}>
                  {formatAmount(monthTotal, false)}
                </span>
              )}
              {isLoading && <Skeleton className="inline-block ml-2 h-4 w-16" />}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateMonth('next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {viewMode === 'month' ? (
          <>
            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((day) => (
                <div key={day} className="text-center text-[10px] font-semibold text-muted-foreground py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const dateKey = format(day, 'yyyy-MM-dd');
                const pnl = dailyPnL.get(dateKey);
                const inMonth = isSameMonth(day, currentMonth);
                const today = isToday(day);
                const dayValue = getDayValue(pnl);
                const hasData = pnl != null && pnl.revenue > 0;

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'relative flex flex-col items-center justify-center rounded-md min-h-[52px] sm:min-h-[64px] border transition-colors',
                      !inMonth && 'opacity-30',
                      today && 'ring-1 ring-primary',
                      getCellBg(dayValue, hasData)
                    )}
                  >
                    <span className={cn(
                      'text-xs font-medium',
                      today && 'text-primary font-bold',
                      !inMonth && 'text-muted-foreground'
                    )}>
                      {today ? 'Today' : format(day, 'd')}
                    </span>
                    {isLoading && inMonth ? (
                      <Skeleton className="h-3 w-10 mt-0.5" />
                    ) : hasData && !isTestMode ? (
                      <span className={cn(
                        "text-[11px] sm:text-xs font-bold mt-0.5",
                        getValueColor(dayValue, true)
                      )}>
                        {formatAmount(dayValue, false)}
                      </span>
                    ) : hasData && isTestMode ? (
                      <span className="text-[11px] text-muted-foreground mt-0.5">$--</span>
                    ) : inMonth ? (
                      <span className="text-[10px] text-muted-foreground/50 mt-0.5">--</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Year view */
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {Array.from({ length: 12 }, (_, i) => {
              const monthDate = new Date(currentYear, i, 1);
              const monthKey = format(monthDate, 'yyyy-MM');
              const value = monthlyTotals.get(monthKey) || 0;
              const hasData = value !== 0;

              return (
                <button
                  key={i}
                  onClick={() => {
                    setCurrentMonth(monthDate);
                    setViewMode('month');
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg p-3 border transition-all hover:shadow-sm',
                    getCellBg(value, hasData),
                    hasData && value > 0 && 'hover:bg-emerald-500/20',
                    !hasData && 'border-border hover:bg-muted/50'
                  )}
                >
                  <span className="text-sm font-medium">{format(monthDate, 'MMM')}</span>
                  {isLoading ? (
                    <Skeleton className="h-4 w-12 mt-1" />
                  ) : !isTestMode ? (
                    <span className={cn(
                      'text-sm font-bold mt-1',
                      getValueColor(value, hasData)
                    )}>
                      {hasData ? formatAmount(value, false) : '--'}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground mt-1">$--</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
