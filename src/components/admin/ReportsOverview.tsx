import { useMemo, useState } from 'react';
import { MetricChart } from './MetricChart';
import { BookingWithDetails } from '@/hooks/useBookings';
import { 
  format, 
  subWeeks, 
  subYears, 
  startOfMonth, 
  startOfQuarter, 
  startOfYear,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  isSameDay,
  isSameWeek,
  isSameMonth,
  startOfDay,
  endOfDay
} from 'date-fns';
import { orgStartOfDay, orgEndOfDay, orgStartOfMonth, orgStartOfYear } from '@/lib/orgDateRange';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { useTestMode } from '@/contexts/TestModeContext';

type TimePeriod = '1W' | '4W' | '1Y' | 'MTD' | 'QTD' | 'YTD' | 'ALL';

interface ReportsOverviewProps {
  bookings: BookingWithDetails[];
  customers: { id: string; created_at: string }[];
}

export function ReportsOverview({ bookings, customers }: ReportsOverviewProps) {
  const orgTimezone = useOrgTimezone();
  const [period, setPeriod] = useState<TimePeriod>('ALL');
  const { isTestMode } = useTestMode();

  const periods: TimePeriod[] = ['1W', '4W', '1Y', 'MTD', 'QTD', 'YTD', 'ALL'];

  const dateRange = useMemo(() => {
    // Every boundary here is an ORG day edge. These are the preset buttons on
    // the reports header — 1W, MTD, YTD and so on — so a viewer in another
    // timezone was silently comparing a different window than the office.
    const now = new Date();
    let start: Date;
    const end = orgEndOfDay(now, orgTimezone);

    switch (period) {
      case '1W':
        start = orgStartOfDay(subWeeks(now, 1), orgTimezone);
        break;
      case '4W':
        start = orgStartOfDay(subWeeks(now, 4), orgTimezone);
        break;
      case '1Y':
        start = orgStartOfDay(subYears(now, 1), orgTimezone);
        break;
      case 'MTD':
        start = orgStartOfMonth(now, orgTimezone);
        break;
      case 'QTD':
        start = orgStartOfDay(startOfQuarter(now), orgTimezone);
        break;
      case 'YTD':
        start = orgStartOfYear(now, orgTimezone);
        break;
      case 'ALL':
      default: {
        const dates = [
          ...bookings.map(b => new Date(b.scheduled_at)),
          ...customers.map(c => new Date(c.created_at))
        ];
        start = dates.length > 0
          ? orgStartOfDay(new Date(Math.min(...dates.map(d => d.getTime()))), orgTimezone)
          : orgStartOfDay(subYears(now, 2), orgTimezone);
        break;
      }
    }

    return { start, end };
  }, [period, bookings, customers, orgTimezone]);

  const dateRangeLabel = useMemo(() => {
    return `${format(dateRange.start, 'MMM yyyy')} – ${format(dateRange.end, 'MMM yyyy')}`;
  }, [dateRange]);

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const bookingDate = new Date(b.scheduled_at);
      return bookingDate >= dateRange.start &&
             bookingDate <= dateRange.end &&
             b.status === 'completed';
    });
  }, [bookings, dateRange]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const customerDate = new Date(c.created_at);
      return customerDate >= dateRange.start && customerDate <= dateRange.end;
    });
  }, [customers, dateRange]);

  const chartData = useMemo(() => {
    const { start, end } = dateRange;
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    let intervals: Date[];
    let matchFn: (bookingDate: Date, intervalDate: Date) => boolean;
    let formatStr: string;
    
    if (daysDiff <= 14) {
      /* eslint-disable local/no-device-local-dates -- bucket geometry inside an
         already org-resolved window (see orgStartOfDay above); these only decide
         which column a point lands in. */
      intervals = eachDayOfInterval({ start, end });
      matchFn = (bookingDate, intervalDate) => isSameDay(bookingDate, intervalDate);
      formatStr = 'yyyy-MM-dd';
    } else if (daysDiff <= 90) {
      intervals = eachWeekOfInterval({ start, end });
      matchFn = (bookingDate, intervalDate) => isSameWeek(bookingDate, intervalDate);
      formatStr = 'yyyy-MM-dd';
    } else {
      intervals = eachMonthOfInterval({ start, end });
      matchFn = (bookingDate, intervalDate) => isSameMonth(bookingDate, intervalDate);
      /* eslint-enable local/no-device-local-dates */
      formatStr = 'yyyy-MM';
    }

    const grossVolume = intervals.map(date => {
      const intervalBookings = filteredBookings.filter(b => 
        matchFn(new Date(b.scheduled_at), date)
      );
      
      return {
        date: format(date, formatStr),
        value: intervalBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0)
      };
    });

    const netVolume = grossVolume.map(d => ({
      ...d,
      value: Math.round(d.value * 0.97 * 100) / 100 // ~3% Stripe fees
    }));

    const newCustomers = intervals.map(date => {
      const intervalCustomers = filteredCustomers.filter(c => 
        matchFn(new Date(c.created_at), date)
      );
      
      return {
        date: format(date, formatStr),
        value: intervalCustomers.length
      };
    });

    const successfulPayments = intervals.map(date => {
      const intervalBookings = filteredBookings.filter(b => 
        matchFn(new Date(b.scheduled_at), date) && b.payment_status === 'paid'
      );
      
      return {
        date: format(date, formatStr),
        value: intervalBookings.length
      };
    });

    const spendPerCustomer = intervals.map(date => {
      const intervalBookings = filteredBookings.filter(b => 
        matchFn(new Date(b.scheduled_at), date)
      );
      
      const uniqueCustomers = new Set(intervalBookings.map(b => b.customer?.id).filter(Boolean));
      const totalRevenue = intervalBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
      
      return {
        date: format(date, formatStr),
        value: uniqueCustomers.size > 0 ? Math.round((totalRevenue / uniqueCustomers.size) * 100) / 100 : 0
      };
    });

    return { grossVolume, netVolume, newCustomers, successfulPayments, spendPerCustomer };
  }, [filteredBookings, filteredCustomers, dateRange]);

  const totals = useMemo(() => {
    const grossVolume = filteredBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
    const netVolume = Math.round(grossVolume * 0.97 * 100) / 100; // ~3% Stripe fees
    const newCustomersCount = filteredCustomers.length;
    const successfulPayments = filteredBookings.filter(b => b.payment_status === 'paid').length;
    const uniqueCustomers = new Set(filteredBookings.map(b => b.customer?.id).filter(Boolean));
    const spendPerCustomer = uniqueCustomers.size > 0 
      ? Math.round((grossVolume / uniqueCustomers.size) * 100) / 100 
      : 0;

    return { grossVolume, netVolume, newCustomersCount, successfulPayments, spendPerCustomer };
  }, [filteredBookings, filteredCustomers]);

  return (
    <div className="min-w-0 overflow-hidden bg-card border border-border rounded-xl p-3 shadow-sm md:p-4">
      <div className="flex min-w-0 items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Reports overview</h3>
      </div>
      
      {/* Time period tabs */}
      <div className="no-scrollbar -mx-1 mb-4 flex max-w-full items-center gap-1 overflow-x-auto px-1 pb-2">
        {periods.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`min-h-10 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              period === p
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Metric charts */}
      <div className="min-w-0 space-y-2">
        <MetricChart
          title="Gross volume"
          value={isTestMode ? 'X.XK' : totals.grossVolume}
          data={chartData.grossVolume}
          dateRange={dateRangeLabel}
          isCurrency={!isTestMode}
        />
        
        <MetricChart
          title="Net volume from sales"
          value={isTestMode ? 'X.XK' : totals.netVolume}
          data={chartData.netVolume}
          dateRange={dateRangeLabel}
          isCurrency={!isTestMode}
        />
        
        <MetricChart
          title="New customers"
          value={isTestMode ? 'XX' : totals.newCustomersCount}
          data={chartData.newCustomers}
          dateRange={dateRangeLabel}
        />
        
        <MetricChart
          title="Successful payments"
          value={isTestMode ? 'XX' : totals.successfulPayments}
          data={chartData.successfulPayments}
          dateRange={dateRangeLabel}
        />
        
        <MetricChart
          title="Spend per customer"
          value={isTestMode ? 'XXX' : totals.spendPerCustomer}
          data={chartData.spendPerCustomer}
          dateRange={dateRangeLabel}
          isCurrency={!isTestMode}
        />
      </div>
    </div>
  );
}
