import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
  getDay,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
} from 'date-fns';
import { cn } from '@/lib/utils';
import { useTestMode } from '@/contexts/TestModeContext';

interface DailyPnL {
  revenue: number;
  expenses: number;
  cleanerPay: number;
  fees: number;
  net: number;
}

interface PnLCalendarProps {
  bookings: any[];
  expenses: any[];
  teamPaysByBooking: Map<string, number>;
}

const formatAmount = (amount: number): string => {
  const abs = Math.abs(amount);
  if (abs >= 1000) {
    return `${amount >= 0 ? '+' : '-'}$${(abs / 1000).toFixed(2)}K`;
  }
  return `${amount >= 0 ? '+' : '-'}$${abs.toFixed(2)}`;
};

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function PnLCalendar({ bookings, expenses, teamPaysByBooking }: PnLCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const { isTestMode } = useTestMode();

  // Calculate daily P&L from bookings and expenses
  // Only count PAID bookings (exclude unpaid, refunded, cancelled) by scheduled date
  const dailyPnL = useMemo(() => {
    const map = new Map<string, DailyPnL>();
    const seenBookingIds = new Set<string>();

    // Process bookings (revenue) - only paid bookings
    bookings.forEach((b: any) => {
      // Skip cancelled, refunded, and unpaid bookings
      if (b.status === 'cancelled') return;
      if (b.payment_status === 'refunded') return;
      if (b.payment_status !== 'paid' && b.payment_status !== 'partial') return;
      
      // Prevent duplicate counting
      if (seenBookingIds.has(b.id)) return;
      seenBookingIds.add(b.id);

      const dateKey = format(new Date(b.scheduled_at), 'yyyy-MM-dd');
      const existing = map.get(dateKey) || { revenue: 0, expenses: 0, cleanerPay: 0, fees: 0, net: 0 };

      const gross = Number(b.total_amount) || 0;
      const fee = (gross * 0.029) + 0.30;

      // Calculate cleaner pay
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

    // Process expenses
    expenses.forEach((e: any) => {
      const dateKey = e.expense_date;
      if (!dateKey) return;
      const existing = map.get(dateKey) || { revenue: 0, expenses: 0, cleanerPay: 0, fees: 0, net: 0 };
      existing.expenses += Number(e.amount) || 0;
      existing.net = existing.revenue - existing.fees - existing.cleanerPay - existing.expenses;
      map.set(dateKey, existing);
    });

    return map;
  }, [bookings, expenses, teamPaysByBooking]);

  // Monthly P&L for year view
  const monthlyPnL = useMemo(() => {
    const map = new Map<string, number>();
    dailyPnL.forEach((val, dateKey) => {
      const monthKey = dateKey.substring(0, 7); // yyyy-MM
      map.set(monthKey, (map.get(monthKey) || 0) + val.net);
    });
    return map;
  }, [dailyPnL]);

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

  // Year selector options
  const currentYear = currentMonth.getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // Monthly total for header
  const monthTotal = useMemo(() => {
    let total = 0;
    const monthKey = format(currentMonth, 'yyyy-MM');
    dailyPnL.forEach((val, dateKey) => {
      if (dateKey.startsWith(monthKey)) total += val.net;
    });
    return total;
  }, [dailyPnL, currentMonth]);

  return (
    <Card className="bg-[hsl(var(--card))] border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg font-bold">P&L Calendar</CardTitle>
          <div className="flex items-center gap-3">
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
                      {format(d, 'yyyy-MM')}
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
              {!isTestMode && (
                <span className={cn(
                  'ml-2 text-sm font-bold',
                  monthTotal >= 0 ? 'text-emerald-500' : 'text-red-500'
                )}>
                  {formatAmount(monthTotal)}
                </span>
              )}
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
                const hasData = pnl && (pnl.revenue > 0 || pnl.expenses > 0);
                const net = pnl?.net || 0;

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'relative flex flex-col items-center justify-center rounded-md min-h-[52px] sm:min-h-[64px] border transition-colors',
                      !inMonth && 'opacity-30',
                      today && 'ring-1 ring-primary',
                      hasData && net > 0 && 'bg-emerald-500/10 border-emerald-500/30',
                      hasData && net < 0 && 'bg-red-500/10 border-red-500/30',
                      hasData && net === 0 && 'bg-muted/50 border-border',
                      !hasData && 'border-transparent'
                    )}
                  >
                    <span className={cn(
                      'text-xs font-medium',
                      today && 'text-primary font-bold',
                      !inMonth && 'text-muted-foreground'
                    )}>
                      {today ? 'Today' : format(day, 'd')}
                    </span>
                    {hasData && !isTestMode && (
                      <span className={cn(
                        'text-[11px] sm:text-xs font-bold mt-0.5',
                        net > 0 ? 'text-emerald-500' : net < 0 ? 'text-red-500' : 'text-muted-foreground'
                      )}>
                        {formatAmount(net)}
                      </span>
                    )}
                    {hasData && isTestMode && (
                      <span className="text-[11px] text-muted-foreground mt-0.5">$--</span>
                    )}
                    {!hasData && inMonth && (
                      <span className="text-[10px] text-muted-foreground/50 mt-0.5">--</span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Year view - 12 month summary grid */
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {Array.from({ length: 12 }, (_, i) => {
              const monthDate = new Date(currentYear, i, 1);
              const monthKey = format(monthDate, 'yyyy-MM');
              const net = monthlyPnL.get(monthKey) || 0;
              const hasData = net !== 0;

              return (
                <button
                  key={i}
                  onClick={() => {
                    setCurrentMonth(monthDate);
                    setViewMode('month');
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-lg p-3 border transition-all hover:shadow-sm',
                    hasData && net > 0 && 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20',
                    hasData && net < 0 && 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20',
                    !hasData && 'border-border hover:bg-muted/50'
                  )}
                >
                  <span className="text-sm font-medium">{format(monthDate, 'MMM')}</span>
                  {!isTestMode ? (
                    <span className={cn(
                      'text-sm font-bold mt-1',
                      net > 0 ? 'text-emerald-500' : net < 0 ? 'text-red-500' : 'text-muted-foreground'
                    )}>
                      {hasData ? formatAmount(net) : '--'}
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
