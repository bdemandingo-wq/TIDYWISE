import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Booking } from '@/types/booking';
import { mockBookings, mockStaff, mockServices } from '@/data/mockData';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const statusColors = {
  pending: 'bg-warning/20 text-warning border-warning/30',
  confirmed: 'bg-primary/20 text-primary border-primary/30',
  completed: 'bg-success/20 text-success border-success/30',
  cancelled: 'bg-destructive/20 text-destructive border-destructive/30',
};

export function SchedulerCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

  const { year, month, days } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    const days: (Date | null)[] = [];
    
    // Add padding for days before the first of the month
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return { year, month, days };
  }, [currentDate]);

  const getBookingsForDate = (date: Date): Booking[] => {
    const dateStr = date.toISOString().split('T')[0];
    return mockBookings.filter(b => b.date === dateStr);
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(year, month + direction, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const getServiceColor = (serviceId: string) => {
    const service = mockServices.find(s => s.id === serviceId);
    return service?.color || '#6b7280';
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">
            {MONTHS[month]} {year}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigateMonth(-1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigateMonth(1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-secondary rounded-lg p-1">
            <Button
              variant={viewMode === 'month' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('month')}
              className="h-7"
            >
              Month
            </Button>
            <Button
              variant={viewMode === 'week' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('week')}
              className="h-7"
            >
              Week
            </Button>
          </div>
          <Button size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Add Booking
          </Button>
        </div>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {DAYS.map((day) => (
          <div
            key={day}
            className="py-3 text-center text-sm font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7">
        {days.map((date, index) => (
          <div
            key={index}
            className={cn(
              'calendar-day min-h-[120px]',
              date && isToday(date) && 'today',
              !date && 'bg-muted/30'
            )}
          >
            {date && (
              <>
                <span
                  className={cn(
                    'text-sm font-medium mb-1',
                    isToday(date) && 'text-primary'
                  )}
                >
                  {date.getDate()}
                </span>
                <div className="w-full space-y-1 overflow-hidden">
                  {getBookingsForDate(date).slice(0, 3).map((booking) => (
                    <button
                      key={booking.id}
                      onClick={() => setSelectedBooking(booking)}
                      className="booking-pill w-full text-left"
                      style={{
                        backgroundColor: `${getServiceColor(booking.serviceId)}20`,
                        color: getServiceColor(booking.serviceId),
                        borderLeft: `3px solid ${getServiceColor(booking.serviceId)}`,
                      }}
                    >
                      <span className="font-medium">{booking.time}</span>{' '}
                      {booking.customerName.split(' ')[0]}
                    </button>
                  ))}
                  {getBookingsForDate(date).length > 3 && (
                    <span className="text-xs text-muted-foreground pl-2">
                      +{getBookingsForDate(date).length - 3} more
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Booking Detail Dialog */}
      <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Booking Details</DialogTitle>
          </DialogHeader>
          {selectedBooking && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold">{selectedBooking.service}</span>
                <Badge className={cn('capitalize', statusColors[selectedBooking.status])}>
                  {selectedBooking.status}
                </Badge>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{selectedBooking.customerName}</p>
                    <p className="text-muted-foreground">{selectedBooking.customerEmail}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      {selectedBooking.date} at {selectedBooking.time}
                    </p>
                    <p className="text-muted-foreground">
                      Duration: {selectedBooking.duration} minutes
                    </p>
                  </div>
                </div>
                
                {selectedBooking.address && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <p>{selectedBooking.address}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <span className="text-2xl font-bold">${selectedBooking.price}</span>
                <div className="flex gap-2">
                  <Button variant="outline">Edit</Button>
                  <Button>Confirm</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
