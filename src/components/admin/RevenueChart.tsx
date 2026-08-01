import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BookingWithDetails } from '@/hooks/useBookings';
import { format, subDays } from 'date-fns';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { getDateInTimezone, getLocalDateInTimezone } from '@/lib/timezoneUtils';

interface RevenueChartProps {
  bookings: BookingWithDetails[];
}

export function RevenueChart({ bookings }: RevenueChartProps) {
  const orgTimezone = useOrgTimezone();

  const chartData = useMemo(() => {
    const last7Days: { date: string; revenue: number; bookings: number }[] = [];
    // "Today" in org tz, so the 7-day window aligns to the org's calendar.
    const today = getLocalDateInTimezone(new Date(), orgTimezone);

    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      // `today` above is already resolved in the org's zone and `date` steps
      // back from it, so this key is org-aligned — it is matched against
      // getDateInTimezone(...) two lines down.
      /* eslint-disable-next-line local/no-device-local-dates -- key derived from an org-resolved anchor */
      const dateStr = format(date, 'yyyy-MM-dd');

      const dayBookings = bookings.filter(b => {
        const bookingDate = getDateInTimezone(b.scheduled_at, orgTimezone);
        return bookingDate === dateStr && b.status !== 'cancelled';
      });

      last7Days.push({
        date: format(date, 'EEE'),
        revenue: dayBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
        bookings: dayBookings.length,
      });
    }

    return last7Days;
  }, [bookings, orgTimezone]);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-4">
      <h3 className="font-semibold mb-4">Revenue (Last 7 Days)</h3>
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 32%, 91%)" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 16%, 47%)', fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(215, 16%, 47%)', fontSize: 12 }}
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(0, 0%, 100%)',
                border: '1px solid hsl(214, 32%, 91%)',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              formatter={(value: number) => [`$${value}`, 'Revenue']}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="hsl(221, 83%, 53%)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorRevenue)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
