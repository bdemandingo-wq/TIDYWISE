import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, MapPin, Clock } from 'lucide-react';

interface Booking {
  id: string;
  booking_number: number;
  scheduled_at: string;
  duration: number;
  status: string;
  address: string | null;
  city: string | null;
  service: {
    name: string;
  } | null;
  customer: {
    first_name: string;
    last_name: string;
  } | null;
}

interface Props {
  staffId: string;
}

export function CleanerCalendar({ staffId }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Fetch all bookings for the month
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['cleaner-calendar', staffId, format(currentMonth, 'yyyy-MM')],
    queryFn: async () => {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_number, scheduled_at, duration, status, address, city,
          service:services(name),
          customer:customers(first_name, last_name)
        `)
        .eq('staff_id', staffId)
        .gte('scheduled_at', monthStart.toISOString())
        .lte('scheduled_at', monthEnd.toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      return data as Booking[];
    },
    enabled: !!staffId,
  });

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  // Group bookings by date
  const bookingsByDate = useMemo(() => {
    const grouped: Record<string, Booking[]> = {};
    bookings.forEach((booking) => {
      const dateKey = format(new Date(booking.scheduled_at), 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(booking);
    });
    return grouped;
  }, [bookings]);

  // Get bookings for selected date
  const selectedDateBookings = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return bookingsByDate[dateKey] || [];
  }, [selectedDate, bookingsByDate]);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-amber-500',
      confirmed: 'bg-blue-500',
      in_progress: 'bg-purple-500',
      completed: 'bg-green-500',
      cancelled: 'bg-red-500',
      no_show: 'bg-gray-500',
    };
    return colors[status] || 'bg-gray-400';
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth((prev) =>
      direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1)
    );
    setSelectedDate(null);
  };

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {format(currentMonth, 'MMMM yyyy')}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigateMonth('prev')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCurrentMonth(new Date());
                  setSelectedDate(new Date());
                }}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigateMonth('next')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                className="text-center text-sm font-medium text-muted-foreground py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayBookings = bookingsByDate[dateKey] || [];
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              const hasJobs = dayBookings.length > 0;

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={`
                    relative min-h-[60px] sm:min-h-[80px] p-1 rounded-lg border transition-all
                    ${isCurrentMonth ? 'bg-card' : 'bg-muted/30 text-muted-foreground'}
                    ${isSelected ? 'ring-2 ring-primary border-primary' : 'border-border/50 hover:border-primary/50'}
                    ${isToday(day) ? 'bg-primary/5' : ''}
                  `}
                >
                  <span
                    className={`
                      text-sm font-medium
                      ${isToday(day) ? 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center mx-auto' : ''}
                    `}
                  >
                    {format(day, 'd')}
                  </span>
                  
                  {/* Job indicators */}
                  {hasJobs && (
                    <div className="mt-1 space-y-0.5">
                      {dayBookings.slice(0, 2).map((booking) => (
                        <div
                          key={booking.id}
                          className={`text-[10px] truncate px-1 py-0.5 rounded ${getStatusColor(booking.status)} text-white`}
                        >
                          {format(new Date(booking.scheduled_at), 'h:mm a')}
                        </div>
                      ))}
                      {dayBookings.length > 2 && (
                        <div className="text-[10px] text-muted-foreground text-center">
                          +{dayBookings.length - 2} more
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Date Details */}
      {selectedDate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDateBookings.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No jobs scheduled for this day
              </p>
            ) : (
              <div className="space-y-3">
                {selectedDateBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                  >
                    <div
                      className={`w-3 h-3 rounded-full mt-1.5 ${getStatusColor(booking.status)}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">#{booking.booking_number}</p>
                        <Badge variant="outline" className="text-xs">
                          {booking.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {booking.service?.name}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(booking.scheduled_at), 'h:mm a')} ({booking.duration} min)
                        </span>
                      </div>
                      {booking.customer && (
                        <p className="text-sm mt-1">
                          {booking.customer.first_name} {booking.customer.last_name}
                        </p>
                      )}
                      {booking.address && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {booking.address}
                          {booking.city ? `, ${booking.city}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center text-muted-foreground py-4">
          Loading schedule...
        </div>
      )}
    </div>
  );
}
