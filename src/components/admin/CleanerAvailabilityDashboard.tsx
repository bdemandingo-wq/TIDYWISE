import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, User, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { format, addDays, startOfWeek, isSameDay, isAfter, isBefore, parse } from 'date-fns';
import { BookingWithDetails } from '@/hooks/useBookings';
import { cn } from '@/lib/utils';

interface CleanerAvailabilityDashboardProps {
  bookings: BookingWithDetails[];
  staff: Array<{
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    avatar_url?: string | null;
    is_active: boolean;
    default_hours?: number | null;
  }>;
  workingHours: Array<{
    id: string;
    staff_id: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_available: boolean;
  }>;
}

const timeSlots = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'
];

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CleanerAvailabilityDashboard({ bookings, staff, workingHours }: CleanerAvailabilityDashboardProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedCleaner, setSelectedCleaner] = useState<string | null>(null);
  
  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const activeStaff = staff.filter(s => s.is_active);

  const getCleanerAvailability = useMemo(() => {
    return (cleanerId: string, date: Date) => {
      const dayOfWeek = date.getDay();
      
      // Get working hours for this cleaner on this day
      const hours = workingHours.find(
        wh => wh.staff_id === cleanerId && wh.day_of_week === dayOfWeek
      );
      
      // Get bookings for this cleaner on this day
      const dayBookings = bookings.filter(b => {
        if (b.staff?.id !== cleanerId) return false;
        const bookingDate = new Date(b.scheduled_at);
        return isSameDay(bookingDate, date) && !['cancelled', 'no_show'].includes(b.status);
      });

      return {
        isWorkingDay: hours?.is_available ?? false,
        startTime: hours?.start_time || '09:00',
        endTime: hours?.end_time || '17:00',
        bookings: dayBookings,
        bookedHours: dayBookings.reduce((sum, b) => {
          const staffMember = staff.find(s => s.id === cleanerId);
          const hours = staffMember?.default_hours || (b.duration / 60) || 2;
          return sum + hours;
        }, 0),
      };
    };
  }, [bookings, workingHours]);

  const cleanerStats = useMemo(() => {
    return activeStaff.map(cleaner => {
      let availableSlots = 0;
      let bookedSlots = 0;

      weekDays.forEach(day => {
        const availability = getCleanerAvailability(cleaner.id, day);
        if (availability.isWorkingDay) {
          // Rough estimate: 8 hours available per working day
          const workHours = 8;
          availableSlots += workHours;
          bookedSlots += availability.bookedHours;
        }
      });

      return {
        ...cleaner,
        availableSlots,
        bookedSlots,
        utilizationRate: availableSlots > 0 ? (bookedSlots / availableSlots) * 100 : 0,
      };
    });
  }, [activeStaff, weekDays, getCleanerAvailability]);

  const filteredStaff = selectedCleaner 
    ? cleanerStats.filter(c => c.id === selectedCleaner)
    : cleanerStats;

  return (
    <div className="space-y-6">
      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(prev => prev - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-medium min-w-[200px] text-center">
            {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </span>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset(prev => prev + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
              Today
            </Button>
          )}
        </div>
      </div>

      {/* Cleaner Filter */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedCleaner === null ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedCleaner(null)}
        >
          All Cleaners
        </Button>
        {activeStaff.map(cleaner => (
          <Button
            key={cleaner.id}
            variant={selectedCleaner === cleaner.id ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCleaner(cleaner.id)}
            className="gap-2"
          >
            <Avatar className="w-5 h-5">
              <AvatarImage src={cleaner.avatar_url || undefined} />
              <AvatarFallback className="text-[10px]">
                {cleaner.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            {cleaner.name}
          </Button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cleanerStats.map(cleaner => (
          <Card 
            key={cleaner.id} 
            className={cn(
              "cursor-pointer transition-all hover:border-primary/50",
              selectedCleaner === cleaner.id && "border-primary ring-2 ring-primary/20"
            )}
            onClick={() => setSelectedCleaner(cleaner.id === selectedCleaner ? null : cleaner.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={cleaner.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {cleaner.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{cleaner.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {cleaner.bookedSlots.toFixed(1)}h booked
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="h-2 flex-1 bg-secondary rounded-full overflow-hidden mr-3">
                  <div 
                    className={cn(
                      "h-full transition-all",
                      cleaner.utilizationRate >= 80 ? "bg-emerald-500" :
                      cleaner.utilizationRate >= 50 ? "bg-blue-500" :
                      cleaner.utilizationRate >= 25 ? "bg-amber-500" : "bg-rose-500"
                    )}
                    style={{ width: `${Math.min(cleaner.utilizationRate, 100)}%` }}
                  />
                </div>
                <span className="text-sm font-medium">{cleaner.utilizationRate.toFixed(0)}%</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Weekly Calendar View */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Weekly Availability
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Header */}
              <div className="grid grid-cols-8 gap-2 mb-4">
                <div className="text-sm font-medium text-muted-foreground p-2">Cleaner</div>
                {weekDays.map((day, idx) => (
                  <div 
                    key={idx} 
                    className={cn(
                      "text-center p-2 rounded-lg",
                      isSameDay(day, new Date()) && "bg-primary/10"
                    )}
                  >
                    <p className="text-xs text-muted-foreground">{dayNames[day.getDay()]}</p>
                    <p className={cn(
                      "font-medium",
                      isSameDay(day, new Date()) && "text-primary"
                    )}>{format(day, 'd')}</p>
                  </div>
                ))}
              </div>

              {/* Cleaner Rows */}
              {filteredStaff.map(cleaner => (
                <div key={cleaner.id} className="grid grid-cols-8 gap-2 mb-2">
                  <div className="flex items-center gap-2 p-2">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={cleaner.avatar_url || undefined} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {cleaner.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate">{cleaner.name}</span>
                  </div>
                  {weekDays.map((day, idx) => {
                    const availability = getCleanerAvailability(cleaner.id, day);
                    const isPast = isBefore(day, new Date()) && !isSameDay(day, new Date());
                    
                    return (
                      <div 
                        key={idx}
                        className={cn(
                          "p-2 rounded-lg text-center text-sm",
                          isPast && "opacity-50",
                          !availability.isWorkingDay && "bg-muted/50",
                          availability.isWorkingDay && availability.bookings.length === 0 && "bg-emerald-50 dark:bg-emerald-900/20",
                          availability.isWorkingDay && availability.bookings.length > 0 && "bg-blue-50 dark:bg-blue-900/20"
                        )}
                      >
                        {!availability.isWorkingDay ? (
                          <span className="text-muted-foreground text-xs">Off</span>
                        ) : availability.bookings.length > 0 ? (
                          <div>
                            <Badge variant="secondary" className="text-xs mb-1">
                              {availability.bookings.length} job{availability.bookings.length > 1 ? 's' : ''}
                            </Badge>
                            <p className="text-xs text-muted-foreground">
                              {availability.bookedHours.toFixed(1)}h
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <Check className="w-4 h-4 text-emerald-600 mb-1" />
                            <span className="text-xs text-emerald-600">Available</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}

              {filteredStaff.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No active cleaners found
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
