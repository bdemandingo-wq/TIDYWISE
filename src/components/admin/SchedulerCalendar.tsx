import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  User,
  Mail,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useBookingsByDateRange, BookingWithDetails } from '@/hooks/useBookings';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { AddBookingDialog } from './AddBookingDialog';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const statusColors: Record<string, string> = {
  pending: 'bg-warning/20 text-warning border-warning/30',
  confirmed: 'bg-primary/20 text-primary border-primary/30',
  in_progress: 'bg-info/20 text-info border-info/30',
  completed: 'bg-success/20 text-success border-success/30',
  cancelled: 'bg-destructive/20 text-destructive border-destructive/30',
  no_show: 'bg-muted text-muted-foreground border-muted',
};

// Default service colors
const serviceColors = [
  '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#f97316'
];

export function SchedulerCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<BookingWithDetails | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Get date range for current month view
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  
  const { data: bookings = [], isLoading } = useBookingsByDateRange(monthStart, monthEnd);

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

  const getBookingsForDate = (date: Date): BookingWithDetails[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return bookings.filter(b => format(new Date(b.scheduled_at), 'yyyy-MM-dd') === dateStr);
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(direction > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const getServiceColor = (index: number) => {
    return serviceColors[index % serviceColors.length];
  };

  const sendCleanerNotification = async (booking: BookingWithDetails) => {
    if (!booking.staff) {
      toast.error('No staff assigned to this booking');
      return;
    }

    setSendingEmail(true);
    try {
      const customerName = booking.customer 
        ? `${booking.customer.first_name} ${booking.customer.last_name}`
        : 'Unknown Customer';

      const { error } = await supabase.functions.invoke('send-cleaner-notification', {
        body: {
          cleanerName: booking.staff.name,
          cleanerEmail: booking.staff.email,
          customerName,
          customerPhone: booking.customer?.phone || 'Not provided',
          serviceName: booking.service?.name || 'Cleaning Service',
          appointmentDate: format(new Date(booking.scheduled_at), 'MMMM d, yyyy'),
          appointmentTime: format(new Date(booking.scheduled_at), 'h:mm a'),
          address: booking.address || 'Address not provided',
          bookingNumber: booking.booking_number,
        },
      });

      if (error) {
        console.error('Email error:', error);
        toast.error('Failed to send notification');
      } else {
        toast.success(`Notification sent to ${booking.staff.name}`);
      }
    } catch (err) {
      console.error('Failed to send notification:', err);
      toast.error('Failed to send notification');
    } finally {
      setSendingEmail(false);
    }
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
          <Button size="sm" className="gap-2" onClick={() => setAddDialogOpen(true)}>
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
        {isLoading ? (
          <div className="col-span-7 flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          days.map((date, index) => (
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
                    {getBookingsForDate(date).slice(0, 3).map((booking, bIndex) => (
                      <button
                        key={booking.id}
                        onClick={() => setSelectedBooking(booking)}
                        className="booking-pill w-full text-left"
                        style={{
                          backgroundColor: `${getServiceColor(bIndex)}20`,
                          color: getServiceColor(bIndex),
                          borderLeft: `3px solid ${getServiceColor(bIndex)}`,
                        }}
                      >
                        <span className="font-medium">
                          {format(new Date(booking.scheduled_at), 'h:mm a')}
                        </span>{' '}
                        {booking.customer?.first_name || 'Customer'}
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
          ))
        )}
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
                <span className="text-lg font-semibold">
                  {selectedBooking.service?.name || 'Cleaning Service'}
                </span>
                <Badge className={cn('capitalize', statusColors[selectedBooking.status])}>
                  {selectedBooking.status.replace('_', ' ')}
                </Badge>
              </div>
              
              <div className="text-sm text-muted-foreground">
                Booking #{selectedBooking.booking_number}
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      {selectedBooking.customer 
                        ? `${selectedBooking.customer.first_name} ${selectedBooking.customer.last_name}`
                        : 'Unknown Customer'
                      }
                    </p>
                    <p className="text-muted-foreground">
                      {selectedBooking.customer?.email || 'No email'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      {format(new Date(selectedBooking.scheduled_at), 'MMMM d, yyyy')} at{' '}
                      {format(new Date(selectedBooking.scheduled_at), 'h:mm a')}
                    </p>
                    <p className="text-muted-foreground">
                      Duration: {selectedBooking.duration} minutes
                    </p>
                  </div>
                </div>
                
                {selectedBooking.address && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <p>
                      {selectedBooking.address}
                      {selectedBooking.city && `, ${selectedBooking.city}`}
                      {selectedBooking.state && `, ${selectedBooking.state}`}
                      {selectedBooking.zip_code && ` ${selectedBooking.zip_code}`}
                    </p>
                  </div>
                )}

                {selectedBooking.staff && (
                  <div className="flex items-center gap-3 text-sm">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Assigned: {selectedBooking.staff.name}</p>
                      <p className="text-muted-foreground">{selectedBooking.staff.email}</p>
                    </div>
                  </div>
                )}

                {selectedBooking.notes && (
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    <p className="font-medium mb-1">Notes:</p>
                    <p className="text-muted-foreground">{selectedBooking.notes}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <span className="text-2xl font-bold">${selectedBooking.total_amount}</span>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="gap-2"
                    onClick={() => sendCleanerNotification(selectedBooking)}
                    disabled={sendingEmail || !selectedBooking.staff}
                  >
                    {sendingEmail ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    Notify Cleaner
                  </Button>
                  <Button>Confirm</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AddBookingDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
    </div>
  );
}
