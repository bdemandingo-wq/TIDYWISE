import { useState, useMemo, type ReactNode } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  User,
  Phone,
  Loader2,
  Search,
  Edit,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useBookings, useUpdateBooking, BookingWithDetails } from '@/hooks/useBookings';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addMonths, subMonths, startOfMonth, endOfMonth, addDays, isSameDay, setHours, setMinutes, parseISO } from 'date-fns';
import { AddBookingDialog } from './AddBookingDialog';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery } from '@tanstack/react-query';

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

const statusLabels: Record<string, string> = {
  pending: 'pending payment',
  confirmed: 'uncleaned',
  in_progress: 'in progress',
  completed: 'clean completed',
  cancelled: 'cancelled',
  no_show: 'no show',
};

// Bolder, more distinct staff colors with higher saturation and contrast
const STAFF_COLOR_PALETTE = [
  '#1d4ed8', // deep blue
  '#15803d', // forest green
  '#7c3aed', // vivid purple
  '#c2410c', // burnt orange
  '#be185d', // magenta
  '#0e7490', // dark cyan
  '#b91c1c', // bold red
  '#4338ca', // indigo
  '#0f766e', // teal
  '#a21caf', // fuchsia
  '#ca8a04', // dark yellow
  '#0369a1', // sky blue dark
];

const getStaffColor = (staffId: string | null | undefined, staffList: { id: string; calendar_color?: string | null }[]): string => {
  if (!staffId) return '#6b7280'; // gray for unassigned
  
  // Check if staff has a custom color
  const staff = staffList.find(s => s.id === staffId);
  if (staff?.calendar_color) {
    return staff.calendar_color;
  }
  
  // Fall back to palette based on sorted index
  const sortedStaffIds = staffList.map(s => s.id).sort();
  const index = sortedStaffIds.indexOf(staffId);
  
  if (index === -1) return '#6b7280';
  
  return STAFF_COLOR_PALETTE[index % STAFF_COLOR_PALETTE.length];
};

interface SchedulerCalendarProps {
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  statusFilter?: 'all' | 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
}

interface DraggableBookingProps {
  booking: BookingWithDetails;
  index: number;
  onClick: () => void;
  staffList: { id: string; name: string; calendar_color?: string | null }[];
}

interface DroppableDayProps {
  id: string;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}

function DroppableDay({ id, disabled, className, children }: DroppableDayProps) {
  const { isOver, setNodeRef } = useDroppable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        isOver && 'ring-2 ring-primary/30 bg-primary/5 ring-inset'
      )}
    >
      {children}
    </div>
  );
}

function DraggableBooking({ booking, index, onClick, staffList }: DraggableBookingProps) {
  const color = getStaffColor(booking.staff_id, staffList);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: booking.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging) onClick();
      }}
      className={cn(
        'booking-pill w-full text-left cursor-grab active:cursor-grabbing group select-none touch-none',
        isDragging && 'opacity-50'
      )}
      style={{
        backgroundColor: `${color}20`,
        color: color,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="flex items-center gap-1">
        <GripVertical className="w-3 h-3 opacity-0 group-hover:opacity-50 shrink-0" />
        <span className="font-medium truncate">
          {format(new Date(booking.scheduled_at), 'h:mm a')}
        </span>{' '}
        <span className="truncate">{booking.customer?.first_name || 'Customer'}</span>
      </div>
    </div>
  );
}

export function SchedulerCalendar({ searchTerm = '', onSearchChange, statusFilter = 'all' }: SchedulerCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<BookingWithDetails | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<BookingWithDetails | null>(null);
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const [activeBooking, setActiveBooking] = useState<BookingWithDetails | null>(null);
  const { isTestMode, maskName, maskEmail, maskAddress } = useTestMode();
  const { organization } = useOrganization();

  const { data: allBookings = [], isLoading } = useBookings();
  const updateBooking = useUpdateBooking();

  // Fetch staff for color consistency
  const { data: staffList = [] } = useQuery({
    queryKey: ['staff-for-calendar', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, calendar_color')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const activeSearchTerm = searchTerm || localSearchTerm;

  const searchResults = useMemo(() => {
    if (!activeSearchTerm.trim()) return [];
    
    const term = activeSearchTerm.toLowerCase();
    return allBookings.filter(b => {
      const customerName = b.customer 
        ? `${b.customer.first_name} ${b.customer.last_name}`.toLowerCase()
        : '';
      const serviceName = b.service?.name?.toLowerCase() || '';
      const staffName = b.staff?.name?.toLowerCase() || '';
      
      return customerName.includes(term) || 
             serviceName.includes(term) || 
             staffName.includes(term) ||
             b.booking_number.toString().includes(term);
    }).sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
  }, [allBookings, activeSearchTerm]);

  const bookings = useMemo(() => {
    let start: Date, end: Date;
    
    if (viewMode === 'week') {
      start = startOfWeek(currentDate);
      end = endOfWeek(currentDate);
    } else {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
    }
    
    return allBookings.filter(b => {
      const bookingDate = new Date(b.scheduled_at);
      const inDateRange = bookingDate >= start && bookingDate <= end;
      const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
      return inDateRange && matchesStatus;
    });
  }, [allBookings, currentDate, viewMode, statusFilter]);

  const { year, month, days } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate);
      const days: Date[] = [];
      for (let i = 0; i < 7; i++) {
        days.push(addDays(weekStart, i));
      }
      return { year, month, days };
    }
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    
    const days: (Date | null)[] = [];
    
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return { year, month, days };
  }, [currentDate, viewMode]);

  const getBookingsForDate = (date: Date): BookingWithDetails[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return bookings.filter(b => format(new Date(b.scheduled_at), 'yyyy-MM-dd') === dateStr);
  };

  const navigate = (direction: number) => {
    if (viewMode === 'week') {
      setCurrentDate(direction > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    } else {
      setCurrentDate(direction > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setViewMode('week'); // Switch to week view to show today's bookings clearly
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const handleDragStart = (event: DragStartEvent) => {
    const booking = allBookings.find(b => b.id === event.active.id);
    if (booking) {
      setActiveBooking(booking);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveBooking(null);

    if (!over) return;

    const bookingId = active.id as string;
    const targetDateStr = over.id as string;

    if (!targetDateStr.startsWith('day-')) return;

    // Parse the date string properly to avoid timezone offset issues
    const targetDate = parseISO(targetDateStr.replace('day-', ''));
    const booking = allBookings.find(b => b.id === bookingId);

    if (!booking) return;

    const currentScheduled = new Date(booking.scheduled_at);
    const newScheduled = setMinutes(
      setHours(targetDate, currentScheduled.getHours()),
      currentScheduled.getMinutes()
    );

    if (isSameDay(currentScheduled, newScheduled)) return;

    try {
      await updateBooking.mutateAsync({
        id: bookingId,
        scheduled_at: newScheduled.toISOString(),
      });
      toast.success(`Booking moved to ${format(newScheduled, 'MMM d, yyyy')}`);
    } catch (error: any) {
      toast.error('Failed to reschedule booking');
      console.error(error);
    }
  };

  const sendCleanerNotification = async (booking: BookingWithDetails) => {
    setSendingEmail(true);
    try {
      const customerName = booking.customer 
        ? `${booking.customer.first_name} ${booking.customer.last_name}`
        : 'Unknown Customer';

      // Get team members for this booking
      const { data: teamAssignments } = await supabase
        .from('booking_team_assignments')
        .select('staff_id, staff:staff(id, name, phone)')
        .eq('booking_id', booking.id);

      // Collect all staff to notify (primary + team members)
      const staffToNotify: { name: string; phone: string }[] = [];
      
      // Add primary staff if assigned
      if (booking.staff?.phone) {
        staffToNotify.push({ name: booking.staff.name, phone: booking.staff.phone });
      }
      
      // Add team members (avoid duplicates)
      if (teamAssignments && teamAssignments.length > 0) {
        for (const assignment of teamAssignments) {
          const staffMember = assignment.staff as any;
          if (staffMember?.phone && !staffToNotify.some(s => s.phone === staffMember.phone)) {
            staffToNotify.push({ name: staffMember.name, phone: staffMember.phone });
          }
        }
      }

      if (staffToNotify.length === 0) {
        toast.error('No cleaners assigned or none have phone numbers');
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const staffMember of staffToNotify) {
        try {
          const { data, error } = await supabase.functions.invoke('send-cleaner-notification', {
            body: {
              cleanerName: staffMember.name,
              cleanerPhone: staffMember.phone,
              customerName,
              customerPhone: booking.customer?.phone || 'Not provided',
              serviceName: booking.service?.name || 'Cleaning Service',
              appointmentDate: format(new Date(booking.scheduled_at), 'MMMM d, yyyy'),
              appointmentTime: format(new Date(booking.scheduled_at), 'h:mm a'),
              address: booking.address || 'Address not provided',
              bookingNumber: booking.booking_number,
              organizationId: organization?.id,
            },
          });

          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          successCount++;
        } catch (err) {
          console.error(`Failed to notify ${staffMember.name}:`, err);
          failCount++;
        }
      }

      if (successCount > 0) {
        const message = staffToNotify.length > 1 
          ? `SMS sent to ${successCount} team member(s)${failCount > 0 ? `, ${failCount} failed` : ''}`
          : `SMS sent to ${staffToNotify[0].name}`;
        toast.success(message);
      } else {
        toast.error('All notifications failed');
      }
    } catch (err: any) {
      console.error('Failed to send notification:', err);
      toast.error('Failed to send notification: ' + (err.message || 'Unknown error'));
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setLocalSearchTerm(value);
    if (onSearchChange) {
      onSearchChange(value);
    }
    setSearchResultsOpen(value.length > 0);
  };

  const handleEditBooking = () => {
    if (selectedBooking) {
      setEditingBooking(selectedBooking);
      setSelectedBooking(null);
    }
  };

  const getHeaderTitle = () => {
    if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate);
      const weekEnd = endOfWeek(currentDate);
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
    }
    return `${MONTHS[month]} ${year}`;
  };

  const getFullAddress = (booking: BookingWithDetails) => {
    const parts = [
      booking.address,
      booking.city,
      booking.state,
      booking.zip_code
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="bg-card rounded-xl border border-border shadow-sm">
        {/* Calendar Header */}
        <div className="flex items-center justify-between p-4 border-b border-border flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">
              {getHeaderTitle()}
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => navigate(1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search bookings..."
                value={activeSearchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 w-64"
                onFocus={() => activeSearchTerm && setSearchResultsOpen(true)}
              />
              
              {searchResultsOpen && activeSearchTerm && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-96 overflow-auto z-50">
                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      No results found
                    </div>
                  ) : (
                    searchResults.slice(0, 10).map((booking) => (
                      <button
                        key={booking.id}
                        className="w-full p-3 text-left hover:bg-muted/50 border-b border-border last:border-0"
                        onClick={() => {
                          setSelectedBooking(booking);
                          setSearchResultsOpen(false);
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {booking.customer 
                              ? maskName(`${booking.customer.first_name} ${booking.customer.last_name}`)
                              : 'Unknown'}
                          </span>
                          <Badge className={cn('text-xs', statusColors[booking.status])}>
                            {statusLabels[booking.status] || booking.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {booking.service?.name} • {format(new Date(booking.scheduled_at), 'MMM d, yyyy h:mm a')}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

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

        {searchResultsOpen && (
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setSearchResultsOpen(false)}
          />
        )}

        {/* Drag hint */}
        <div className="px-4 py-2 bg-secondary/30 border-b border-border text-sm text-muted-foreground flex items-center gap-2">
          <GripVertical className="w-4 h-4" />
          Drag and drop bookings to reschedule them
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
            days.map((date, index) => {
              const dayBookings = date ? getBookingsForDate(date) : [];
              return (
                <DroppableDay
                  key={index}
                  id={date ? `day-${format(date, 'yyyy-MM-dd')}` : `empty-${index}`}
                  disabled={!date}
                  className={cn(
                    'calendar-day',
                    viewMode === 'week' ? 'min-h-[300px]' : 'min-h-[120px]',
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
                        {viewMode === 'week' ? format(date, 'MMM d') : date.getDate()}
                      </span>
                      <div className="w-full space-y-1 overflow-y-auto max-h-[200px] scrollbar-thin">
                        {dayBookings.map((booking, bIndex) => (
                            <DraggableBooking
                              key={booking.id}
                              booking={booking}
                              index={bIndex}
                              onClick={() => setSelectedBooking(booking)}
                              staffList={staffList}
                            />
                          ))}
                      </div>
                    </>
                  )}
                </DroppableDay>
              );
            })
          )}
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeBooking && (
            <div className="booking-pill bg-primary/20 text-primary border-l-4 border-primary px-2 py-1 rounded text-sm shadow-lg">
              {format(new Date(activeBooking.scheduled_at), 'h:mm a')} - {activeBooking.customer?.first_name || 'Customer'}
            </div>
          )}
        </DragOverlay>

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
                    {statusLabels[selectedBooking.status] || selectedBooking.status}
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
                          ? maskName(`${selectedBooking.customer.first_name} ${selectedBooking.customer.last_name}`)
                          : 'Unknown Customer'
                        }
                      </p>
                      <p className="text-muted-foreground">
                        {selectedBooking.customer ? maskEmail(selectedBooking.customer.email) : 'No email'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {format(new Date(selectedBooking.scheduled_at), 'EEEE, MMMM d, yyyy')}
                      </p>
                      <p className="text-muted-foreground">
                        {format(new Date(selectedBooking.scheduled_at), 'h:mm a')}
                      </p>
                    </div>
                  </div>
                  
                  {getFullAddress(selectedBooking) && (
                    <div className="flex items-center gap-3 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <p>{maskAddress(getFullAddress(selectedBooking))}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleEditBooking}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  {selectedBooking.staff && (
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => sendCleanerNotification(selectedBooking)}
                      disabled={sendingEmail}
                    >
                      {sendingEmail ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Phone className="w-4 h-4 mr-2" />
                      )}
                      Notify Cleaner
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add/Edit Booking Dialog */}
        <AddBookingDialog
          open={addDialogOpen || !!editingBooking}
          onOpenChange={(open) => {
            if (!open) {
              setAddDialogOpen(false);
              setEditingBooking(null);
            }
          }}
          booking={editingBooking}
          onDuplicate={(duplicatedBooking) => {
            // Close current dialog first, then reopen with duplicated booking
            setEditingBooking(null);
            setAddDialogOpen(false);
            // Use setTimeout to ensure dialog closes before reopening
            setTimeout(() => {
              setEditingBooking({
                ...duplicatedBooking,
                id: '' as any,
                booking_number: 0,
              });
              setAddDialogOpen(true);
            }, 100);
          }}
        />
      </div>
    </DndContext>
  );
}