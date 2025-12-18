import { useMemo } from 'react';
import { Booking } from '@/types/booking';
import { cn } from '@/lib/utils';
import { Clock, User, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mockServices } from '@/data/mockData';

interface UpcomingBookingsProps {
  bookings: Booking[];
}

const statusColors = {
  pending: 'bg-warning/20 text-warning border-warning/30',
  confirmed: 'bg-primary/20 text-primary border-primary/30',
  completed: 'bg-success/20 text-success border-success/30',
  cancelled: 'bg-destructive/20 text-destructive border-destructive/30',
};

export function UpcomingBookings({ bookings }: UpcomingBookingsProps) {
  const upcomingBookings = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return bookings
      .filter(b => b.date >= today && b.status !== 'cancelled')
      .slice(0, 5);
  }, [bookings]);

  const getServiceColor = (serviceId: string) => {
    const service = mockServices.find(s => s.id === serviceId);
    return service?.color || '#6b7280';
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold">Upcoming Bookings</h3>
        <Button variant="ghost" size="sm" className="gap-1 text-primary">
          View all <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="divide-y divide-border">
        {upcomingBookings.map((booking) => (
          <div
            key={booking.id}
            className="p-4 hover:bg-muted/30 transition-colors cursor-pointer"
          >
            <div className="flex items-start gap-3">
              <div
                className="w-1 h-full min-h-[60px] rounded-full"
                style={{ backgroundColor: getServiceColor(booking.serviceId) }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">{booking.service}</p>
                  <Badge className={cn('capitalize text-xs', statusColors[booking.status])}>
                    {booking.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    <span className="truncate">{booking.customerName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{booking.time}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(booking.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
