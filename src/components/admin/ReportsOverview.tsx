import { useMemo, useState } from 'react';
import { MetricChart } from './MetricChart';
import { BookingWithDetails } from '@/hooks/useBookings';
import { 
  format, 
  subDays, 
  subWeeks, 
  subMonths, 
  subYears, 
  startOfMonth, 
  startOfQuarter, 
  startOfYear,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  isWithinInterval,
  parseISO
} from 'date-fns';

type TimePeriod = '1W' | '4W' | '1Y' | 'MTD' | 'QTD' | 'YTD' | 'ALL';

interface ReportsOverviewProps {
  bookings: BookingWithDetails[];
  customers: { id: string; created_at: string }[];
}

export function ReportsOverview({ bookings, customers }: ReportsOverviewProps) {
  const [period, setPeriod] = useState<TimePeriod>('ALL');

  const periods: TimePeriod[] = ['1W', '4W', '1Y', 'MTD', 'QTD', 'YTD', 'ALL'];

  const dateRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end = now;

    switch (period) {
      case '1W':
        start = subWeeks(now, 1);
        break;
      case '4W':
        start = subWeeks(now, 4);
        break;
      case '1Y':
        start = subYears(now, 1);
        break;
      case 'MTD':
        start = startOfMonth(now);
        break;
      case 'QTD':
        start = startOfQuarter(now);
        break;
      case 'YTD':
        start = startOfYear(now);
        break;
      case 'ALL':
      default:
        // Find earliest booking or customer date
        const dates = [
          ...bookings.map(b => new Date(b.scheduled_at)),
          ...customers.map(c => new Date(c.created_at))
        ];
        start = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : subYears(now, 2);
        break;
    }

    return { start, end };
  }, [period, bookings, customers]);

  const dateRangeLabel = useMemo(() => {
    return `${format(dateRange.start, 'MMM yyyy')} – ${format(dateRange.end, 'MMM yyyy')}`;
  }, [dateRange]);

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const bookingDate = new Date(b.scheduled_at);
      return isWithinInterval(bookingDate, { start: dateRange.start, end: dateRange.end }) &&
             b.status !== 'cancelled';
    });
  }, [bookings, dateRange]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const customerDate = new Date(c.created_at);
      return isWithinInterval(customerDate, { start: dateRange.start, end: dateRange.end });
    });
  }, [customers, dateRange]);

  const chartData = useMemo(() => {
    const { start, end } = dateRange;
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    let intervals: Date[];
    let formatStr: string;
    
    if (daysDiff <= 14) {
      intervals = eachDayOfInterval({ start, end });
      formatStr = 'yyyy-MM-dd';
    } else if (daysDiff <= 90) {
      intervals = eachWeekOfInterval({ start, end });
      formatStr = 'yyyy-MM-dd';
    } else {
      intervals = eachMonthOfInterval({ start, end });
      formatStr = 'yyyy-MM';
    }

    const grossVolume = intervals.map(date => {
      const intervalEnd = daysDiff <= 14 ? date : 
                          daysDiff <= 90 ? subDays(new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000), 1) :
                          new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const intervalBookings = filteredBookings.filter(b => {
        const bDate = new Date(b.scheduled_at);
        return bDate >= date && bDate <= intervalEnd;
      });
      
      return {
        date: format(date, formatStr),
        value: intervalBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0)
      };
    });

    const netVolume = grossVolume.map(d => ({
      ...d,
      value: d.value * 0.94 // Approximate net after fees
    }));

    const newCustomers = intervals.map(date => {
      const intervalEnd = daysDiff <= 14 ? date : 
                          daysDiff <= 90 ? subDays(new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000), 1) :
                          new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const intervalCustomers = filteredCustomers.filter(c => {
        const cDate = new Date(c.created_at);
        return cDate >= date && cDate <= intervalEnd;
      });
      
      return {
        date: format(date, formatStr),
        value: intervalCustomers.length
      };
    });

    const successfulPayments = intervals.map(date => {
      const intervalEnd = daysDiff <= 14 ? date : 
                          daysDiff <= 90 ? subDays(new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000), 1) :
                          new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const intervalBookings = filteredBookings.filter(b => {
        const bDate = new Date(b.scheduled_at);
        return bDate >= date && bDate <= intervalEnd && b.payment_status === 'paid';
      });
      
      return {
        date: format(date, formatStr),
        value: intervalBookings.length
      };
    });

    const spendPerCustomer = intervals.map(date => {
      const intervalEnd = daysDiff <= 14 ? date : 
                          daysDiff <= 90 ? subDays(new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000), 1) :
                          new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const intervalBookings = filteredBookings.filter(b => {
        const bDate = new Date(b.scheduled_at);
        return bDate >= date && bDate <= intervalEnd;
      });
      
      const uniqueCustomers = new Set(intervalBookings.map(b => b.customer?.id).filter(Boolean));
      const totalRevenue = intervalBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
      
      return {
        date: format(date, formatStr),
        value: uniqueCustomers.size > 0 ? totalRevenue / uniqueCustomers.size : 0
      };
    });

    return { grossVolume, netVolume, newCustomers, successfulPayments, spendPerCustomer };
  }, [filteredBookings, filteredCustomers, dateRange]);

  const totals = useMemo(() => {
    const grossVolume = filteredBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
    const netVolume = grossVolume * 0.94;
    const newCustomersCount = filteredCustomers.length;
    const successfulPayments = filteredBookings.filter(b => b.payment_status === 'paid').length;
    const uniqueCustomers = new Set(filteredBookings.map(b => b.customer?.id).filter(Boolean));
    const spendPerCustomer = uniqueCustomers.size > 0 ? grossVolume / uniqueCustomers.size : 0;

    return { grossVolume, netVolume, newCustomersCount, successfulPayments, spendPerCustomer };
  }, [filteredBookings, filteredCustomers]);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Reports overview</h3>
      </div>
      
      {/* Time period tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-2">
        {periods.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
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
      <div className="space-y-2">
        <MetricChart
          title="Gross volume"
          value={totals.grossVolume}
          data={chartData.grossVolume}
          dateRange={dateRangeLabel}
          isCurrency
        />
        
        <MetricChart
          title="Net volume from sales"
          value={totals.netVolume}
          data={chartData.netVolume}
          dateRange={dateRangeLabel}
          isCurrency
        />
        
        <MetricChart
          title="New customers"
          value={totals.newCustomersCount}
          data={chartData.newCustomers}
          dateRange={dateRangeLabel}
        />
        
        <MetricChart
          title="Successful payments"
          value={totals.successfulPayments}
          data={chartData.successfulPayments}
          dateRange={dateRangeLabel}
        />
        
        <MetricChart
          title="Spend per customer"
          value={totals.spendPerCustomer}
          data={chartData.spendPerCustomer}
          dateRange={dateRangeLabel}
          isCurrency
        />
      </div>
    </div>
  );
}
