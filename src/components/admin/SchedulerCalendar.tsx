import { useState, useMemo, type ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
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
  Users,
  Copy,
  Trash2,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useBookings, useUpdateBooking, useDeleteBooking, BookingWithDetails } from '@/hooks/useBookings';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, addMonths, subMonths, startOfMonth, endOfMonth, addDays, isSameDay, setHours, setMinutes, parseISO } from 'date-fns';
import { AddBookingDialog } from './AddBookingDialog';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQuery } from '@tanstack/react-query';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { getDateInTimezone, formatInTimezone } from '@/lib/timezoneUtils';

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
  staffFilter?: string | null;
}

interface DraggableBookingProps {
  booking: BookingWithDetails;
  index: number;
  onClick: () => void;
  staffList: { id: string; name: string; calendar_color?: string | null }[];
  teamStaffIds?: string[];
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

function TrashDropZone({ floating }: { floating?: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'trash-zone' });

  if (floating) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          'fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border-2 border-dashed transition-all duration-200 shadow-lg',
          isOver
            ? 'border-destructive bg-destructive/20 scale-110 shadow-destructive/30'
            : 'border-destructive/60 bg-background/95 backdrop-blur-sm'
        )}
      >
        <Trash2 className={cn('w-5 h-5 text-destructive', isOver && 'animate-bounce')} />
        <span className={cn(
          'text-sm font-bold text-destructive whitespace-nowrap',
          isOver && 'animate-pulse'
        )}>
          Drop to Delete
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center justify-center px-3 py-1.5 rounded-md border-2 border-dashed transition-all duration-200 select-none',
        isOver
          ? 'border-destructive bg-destructive/15 scale-105'
          : 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10'
      )}
      title="Drag a booking here to delete"
    >
      <span className={cn(
        'text-xs font-bold text-destructive whitespace-nowrap',
        isOver && 'animate-pulse'
      )}>
        Drag to Delete
      </span>
    </div>
  );
}

// Helper to format customer name as "FirstName L." 
const formatCustomerName = (customer: { first_name: string; last_name: string } | null): string => {
  if (!customer) return 'Customer';
  const firstName = customer.first_name || '';
  const lastInitial = customer.last_name ? `${customer.last_name.charAt(0)}.` : '';
  return `${firstName} ${lastInitial}`.trim();
};

function DraggableBooking({ booking, index, onClick, staffList, teamStaffIds = [], disableDrag }: DraggableBookingProps & { disableDrag?: boolean }) {
  const color = getStaffColor(booking.staff_id, staffList);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: booking.id,
    disabled: disableDrag,
  });

  // Get team member colors (excluding primary)
  const teamColors = teamStaffIds
    .filter(id => id !== booking.staff_id)
    .map(id => getStaffColor(id, staffList));

  return (
    <div
      ref={setNodeRef}
      {...(disableDrag ? {} : { ...attributes, ...listeners })}
      onClick={() => {
        if (!isDragging) onClick();
      }}
      className={cn(
        'booking-pill w-full text-left select-none',
        !disableDrag && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-50'
      )}
      style={{
        backgroundColor: `${color}20`,
        color: color,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="flex items-center gap-1">
        {!disableDrag && <GripVertical className="w-3 h-3 opacity-0 group-hover:opacity-50 shrink-0" />}
        <span className="truncate font-medium">{formatCustomerName(booking.customer)}</span>
        {teamColors.length > 0 && (
          <div className="flex items-center gap-0.5 ml-auto shrink-0">
            {teamColors.map((tc, i) => (
              <div key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: tc }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SchedulerCalendar({ searchTerm = '', onSearchChange, statusFilter = 'all', staffFilter = null }: SchedulerCalendarProps) {
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedBooking, setSelectedBooking] = useState<BookingWithDetails | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<BookingWithDetails | null>(null);
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const [activeBooking, setActiveBooking] = useState<BookingWithDetails | null>(null);
  const [dayBookingsPopup, setDayBookingsPopup] = useState<{ date: Date; bookings: BookingWithDetails[] } | null>(null);
  const { isTestMode, maskName, maskEmail, maskAddress } = useTestMode();
  const { organization } = useOrganization();
  const orgTimezone = useOrgTimezone();

  const { data: allBookings = [], isLoading } = useBookings();

  // Fetch team assignments for the selected booking (org-scoped)
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['booking-team-assignments', selectedBooking?.id, organization?.id],
    queryFn: async () => {
      if (!selectedBooking?.id || !organization?.id) return [];
      const { data, error } = await supabase
        .from('booking_team_assignments')
        .select('staff_id, staff:staff(id, name)')
        .eq('booking_id', selectedBooking.id)
        .eq('organization_id', organization.id);
      if (error) return [];
      return (data || []).map((a: any) => a.staff).filter(Boolean);
    },
    enabled: !!selectedBooking?.id && !!organization?.id,
  });

  // Fetch all team assignments for calendar display
  const { data: allTeamAssignments = [] } = useQuery({
    queryKey: ['all-team-assignments', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('booking_team_assignments')
        .select('booking_id, staff_id')
        .eq('organization_id', organization.id);
      if (error) return [];
      return data || [];
    },
    enabled: !!organization?.id,
  });

  // Build a map of booking_id -> staff_ids for team assignments
  const teamAssignmentMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of allTeamAssignments) {
      const existing = map.get(a.booking_id) || [];
      existing.push(a.staff_id);
      map.set(a.booking_id, existing);
    }
    return map;
  }, [allTeamAssignments]);
  const updateBooking = useUpdateBooking();
  const deleteBooking = useDeleteBooking();
  const [trashConfirmBooking, setTrashConfirmBooking] = useState<BookingWithDetails | null>(null);
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

  // On mobile, require long-press (500ms delay) to initiate drag; on desktop use distance
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: isMobile
        ? { delay: 500, tolerance: 5 }
        : { distance: 8 },
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
      const matchesStaff = !staffFilter || b.staff_id === staffFilter;
      return inDateRange && matchesStatus && matchesStaff;
    });
  }, [allBookings, currentDate, viewMode, statusFilter, staffFilter]);

  const { year, month, days, monthWeekRows } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate);
      const days: (Date | null)[] = [];
      for (let i = 0; i < 7; i++) {
        days.push(addDays(weekStart, i));
      }
      return { year, month, days, monthWeekRows: 1 };
    }

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const totalCells = Math.ceil((startPadding + daysInMonth) / 7) * 7;

    const days: (Date | null)[] = [];

    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    while (days.length < totalCells) {
      days.push(null);
    }

    return { year, month, days, monthWeekRows: totalCells / 7 };
  }, [currentDate, viewMode]);

  const getBookingsForDate = (date: Date): BookingWithDetails[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return bookings.filter(b => getDateInTimezone(b.scheduled_at, orgTimezone) === dateStr);
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
    const targetId = over.id as string;
    const booking = allBookings.find(b => b.id === bookingId);
    if (!booking) return;

    // Handle trash drop
    if (targetId === 'trash-zone') {
      setActiveBooking(null);
      setTrashConfirmBooking(booking);
      return;
    }

    if (!targetId.startsWith('day-')) return;

    // Parse the date string properly to avoid timezone offset issues
    const targetDate = parseISO(targetId.replace('day-', ''));

    if (!booking) return;

    const currentScheduled = new Date(booking.scheduled_at);
    const previousScheduledISO = booking.scheduled_at; // Store for undo
    const newScheduled = setMinutes(
      setHours(targetDate, currentScheduled.getHours()),
      currentScheduled.getMinutes()
    );

    if (isSameDay(currentScheduled, newScheduled)) return;

    const customerName = formatCustomerName(booking.customer);

    try {
      await updateBooking.mutateAsync({
        id: bookingId,
        scheduled_at: newScheduled.toISOString(),
      });
      
      // Show success toast with undo action
      toast.success(
        `${customerName} moved to ${format(newScheduled, 'MMM d')}`,
        {
          duration: 8000,
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await updateBooking.mutateAsync({
                  id: bookingId,
                  scheduled_at: previousScheduledISO,
                });
                toast.success(`Booking restored to ${format(currentScheduled, 'MMM d, yyyy')}`);
              } catch (undoError) {
                toast.error('Failed to undo');
                console.error(undoError);
              }
            },
          },
        }
      );
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

      // Get team members for this booking (org-scoped)
      const { data: teamAssignments } = await supabase
        .from('booking_team_assignments')
        .select('staff_id, staff:staff(id, name, phone)')
        .eq('booking_id', booking.id)
        .eq('organization_id', organization?.id ?? '');

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
              serviceName: booking.service?.name || (booking.total_amount === 0 ? 'Re-clean' : 'Cleaning Service'),
              appointmentDate: formatInTimezone(booking.scheduled_at, orgTimezone, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
              appointmentTime: formatInTimezone(booking.scheduled_at, orgTimezone, { hour: 'numeric', minute: '2-digit', hour12: true }),
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
      <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col h-[calc(100vh-10rem)] md:h-[calc(100vh-8rem)]">
        {/* Calendar Header */}
        <div className="flex items-center justify-between p-2 md:p-4 border-b border-border flex-wrap gap-2 md:gap-4">
          <div className="flex items-center gap-2 md:gap-4">
            <h2 className="text-sm md:text-lg font-semibold whitespace-nowrap">
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
            {!isMobile && <TrashDropZone />}
          </div>

          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search bookings..."
                value={activeSearchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10 w-40 md:w-64"
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
                          {booking.service?.name || (booking.total_amount === 0 ? 'Re-clean' : 'Service')} • {formatInTimezone(booking.scheduled_at, orgTimezone, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
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

        {!isMobile && (
          <div className="px-4 py-2 bg-secondary/30 border-b border-border text-sm text-muted-foreground flex items-center gap-2">
            <GripVertical className="w-4 h-4" />
            Drag and drop bookings to reschedule them
          </div>
        )}

        {/* Day Headers */}
        <div className="flex-1 flex flex-col overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {DAYS.map((day) => (
            <div
              key={day}
              className="py-1.5 md:py-3 text-center text-[10px] md:text-sm font-medium text-muted-foreground"
            >
              {isMobile ? day.charAt(0) : day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div
          className="grid grid-cols-7 flex-1 min-h-0"
          style={{
            gridTemplateRows:
              viewMode === 'week'
                ? 'repeat(1, minmax(0, 1fr))'
                : `repeat(${monthWeekRows}, minmax(0, 1fr))`,
          }}
        >
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
                    'calendar-day min-h-0 overflow-hidden',
                    viewMode === 'week'
                      ? (isMobile ? 'min-h-[100px]' : 'min-h-[200px]')
                      : '',
                    date && isToday(date) && 'today',
                    !date && 'bg-muted/30'
                  )}
                >
                  {date && (
                    <>
                      <span
                        className={cn(
                          'text-[10px] md:text-sm font-medium mb-0.5 md:mb-1',
                          isToday(date) && 'text-primary'
                        )}
                      >
                        {viewMode === 'week' ? (isMobile ? format(date, 'd') : format(date, 'MMM d')) : date.getDate()}
                      </span>
                        <div
                          className={cn(
                            'w-full space-y-0.5 md:space-y-1 overflow-y-auto scrollbar-thin min-h-0',
                            viewMode === 'week'
                              ? (isMobile ? 'max-h-[80px]' : 'max-h-[200px]')
                              : 'flex-1'
                          )}
                        >
                        {(() => {
                          const maxVisible = isMobile && viewMode === 'month' ? 2 : dayBookings.length;
                          const visibleBookings = dayBookings.slice(0, maxVisible);
                          const overflowCount = dayBookings.length - maxVisible;
                          return (
                            <>
                              {visibleBookings.map((booking, bIndex) => (
                                <DraggableBooking
                                  key={booking.id}
                                  booking={booking}
                                  index={bIndex}
                                  onClick={() => setSelectedBooking(booking)}
                                  staffList={staffList}
                                  teamStaffIds={teamAssignmentMap.get(booking.id)}
                                  disableDrag={isMobile}
                                />
                              ))}
                              {overflowCount > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDayBookingsPopup({ date: date!, bookings: dayBookings });
                                  }}
                                  className="w-full text-center text-[10px] font-semibold text-primary bg-primary/10 rounded py-0.5 hover:bg-primary/20 transition-colors"
                                >
                                  +{overflowCount} more
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </DroppableDay>
              );
            })
          )}
        </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeBooking && (
            <div className="booking-pill bg-primary/20 text-primary border-l-4 border-primary px-2 py-1 rounded text-sm shadow-lg">
              {formatCustomerName(activeBooking.customer)}
            </div>
          )}
        </DragOverlay>

        {/* Day Bookings Popup - shows all bookings for a day when clicking +X */}
        <Dialog open={!!dayBookingsPopup} onOpenChange={() => setDayBookingsPopup(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {dayBookingsPopup && format(dayBookingsPopup.date, 'MMMM d, yyyy')}
              </DialogTitle>
            </DialogHeader>
            {dayBookingsPopup && (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {dayBookingsPopup.bookings.map((booking) => {
                  const color = getStaffColor(booking.staff_id, staffList);
                  const fullName = booking.customer 
                    ? `${booking.customer.first_name} ${booking.customer.last_name}`
                    : 'Customer';
                  return (
                    <button
                      key={booking.id}
                      onClick={() => {
                        setDayBookingsPopup(null);
                        setSelectedBooking(booking);
                      }}
                      className="w-full text-left px-4 py-3 rounded-lg border transition-colors hover:opacity-80"
                      style={{
                        backgroundColor: `${color}15`,
                        borderColor: `${color}40`,
                        borderLeftWidth: '4px',
                        borderLeftColor: color,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium" style={{ color }}>{maskName(fullName)}</span>
                        <Badge className={cn('text-xs', statusColors[booking.status])}>
                          {statusLabels[booking.status] || booking.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                        <span>{formatInTimezone(booking.scheduled_at, orgTimezone, { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                        <span>•</span>
                        <span>{booking.service?.name || 'Service'}</span>
                        {!isTestMode && booking.total_amount > 0 && (
                          <>
                            <span>•</span>
                            <span>${Number(booking.total_amount).toFixed(0)}</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </DialogContent>
        </Dialog>

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
                    {selectedBooking.service?.name || (selectedBooking.total_amount === 0 ? 'Re-clean' : 'Service')}
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
                        {formatInTimezone(selectedBooking.scheduled_at, orgTimezone, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                      <p className="text-muted-foreground">
                        {formatInTimezone(selectedBooking.scheduled_at, orgTimezone, { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </p>
                    </div>
                  </div>
                  
                  {getFullAddress(selectedBooking) && (
                    <div className="flex items-center gap-3 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <p>{maskAddress(getFullAddress(selectedBooking))}</p>
                    </div>
                  )}

                  {/* Staff / Team Assignments */}
                  {(selectedBooking.staff || teamMembers.length > 0) && (() => {
                    // Filter out primary staff from team list to avoid duplicates
                    const additionalTeam = teamMembers.filter((m: any) => m.id !== selectedBooking.staff_id);
                    return (
                      <div className="flex items-start gap-3 text-sm">
                        <Users className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="font-medium">Assigned Staff</p>
                          {selectedBooking.staff && (
                            <p className="text-muted-foreground">
                              {maskName(selectedBooking.staff.name)}{additionalTeam.length > 0 ? ' (Primary)' : ''}
                            </p>
                          )}
                          {additionalTeam.map((member: any) => (
                            <p key={member.id} className="text-muted-foreground">
                              {maskName(member.name)} (Team)
                            </p>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex gap-2 pt-4 border-t flex-wrap">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleEditBooking}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      const duplicated = {
                        ...selectedBooking,
                        id: '' as any,
                        booking_number: 0,
                        status: 'pending' as const,
                        payment_status: 'pending' as const,
                      };
                      setSelectedBooking(null);
                      setTimeout(() => {
                        setEditingBooking(duplicated as BookingWithDetails);
                      }, 100);
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Duplicate
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

        {/* Trash Confirmation Dialog */}
        <AlertDialog open={!!trashConfirmBooking} onOpenChange={(open) => !open && setTrashConfirmBooking(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Booking</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the booking for{' '}
                <span className="font-semibold text-foreground">
                  {trashConfirmBooking?.customer
                    ? `${trashConfirmBooking.customer.first_name} ${trashConfirmBooking.customer.last_name}`
                    : 'Unknown Customer'}
                </span>
                {trashConfirmBooking?.scheduled_at && (
                  <> on {formatInTimezone(trashConfirmBooking.scheduled_at, orgTimezone, { weekday: 'long', month: 'long', day: 'numeric' })}</>
                )}
                ? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (!trashConfirmBooking) return;
                  try {
                    await deleteBooking.mutateAsync(trashConfirmBooking.id);
                    setTrashConfirmBooking(null);
                  } catch (err) {
                    console.error('Delete failed:', err);
                  }
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DndContext>
  );
}