import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { differenceInMinutes, parseISO, format, isSameDay, getDay } from 'date-fns';
import { orgStartOfDay, orgEndOfDay, orgYMD, orgDateKey, orgSetTimeOnDay } from '@/lib/orgDateRange';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';
import { useOrgId } from '@/hooks/useOrgId';

export interface ConflictInfo {
  bookingId: string;
  bookingNumber: number;
  scheduledAt: string;
  duration: number;
  customerName: string;
  serviceName: string;
  overlapType: 'overlap' | 'proximity' | 'unavailable';
  minutesApart: number;
}

export interface StaffAvailability {
  staffId: string;
  isAvailable: boolean;
  conflicts: ConflictInfo[];
  isOutsideWorkingHours?: boolean; // New: indicates if unavailable due to working hours
}

interface WorkingHour {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  staff_id: string;
}

const TRAVEL_BUFFER_MINUTES = 60;

export function useCleanerConflicts(
  selectedDate: Date | undefined,
  selectedTime: string,
  duration: number = 120, // default 2 hours
  currentBookingId?: string // Exclude this booking when editing
) {
  const { timezone: orgTimezone } = useOrgTimezone();
  const [allBookingsOnDate, setAllBookingsOnDate] = useState<any[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [timeOffStaffIds, setTimeOffStaffIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const { organizationId } = useOrgId();


  // Fetch bookings and working hours for the selected date
  useEffect(() => {
    if (!selectedDate || !organizationId) {
      setAllBookingsOnDate([]);
      setWorkingHours([]);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Org time, not the device's. setHours() operates in BROWSER-LOCAL
        // time, so an admin scheduling from another timezone fetched a
        // 24-hour band offset from the business's day — and a clash sitting
        // in the missing hours would not be found. This is the double-booking
        // check: a false negative here sends two cleaners to one house.
        const startOfDay = orgStartOfDay(new Date(selectedDate), orgTimezone);
        const endOfDay = orgEndOfDay(new Date(selectedDate), orgTimezone);

        // SECURITY: Fetch bookings scoped to this organization only
        const { data: bookingsData, error: bookingsError } = await supabase
          .from('bookings')
          .select(`
            id,
            booking_number,
            scheduled_at,
            duration,
            staff_id,
            status,
            customer:customers(first_name, last_name),
            service:services(name)
          `)
          .eq('organization_id', organizationId)
          .gte('scheduled_at', startOfDay.toISOString())
          .lte('scheduled_at', endOfDay.toISOString())
          .not('status', 'in', '("cancelled","no_show")');

        if (bookingsError) throw bookingsError;

        // Fetch team assignments only for bookings in this org on this date
        const bookingIds = (bookingsData || []).map(b => b.id);
        let teamAssignments: { booking_id: string; staff_id: string }[] = [];
        if (bookingIds.length > 0) {
          const { data: teamData } = await supabase
            .from('booking_team_assignments')
            .select('booking_id, staff_id')
            .in('booking_id', bookingIds);
          teamAssignments = teamData || [];
        }

        // Merge team assignments into bookings
        const bookingsWithTeam = (bookingsData || []).map(booking => {
          const teamStaffIds = teamAssignments
            .filter(t => t.booking_id === booking.id)
            .map(t => t.staff_id);
          return {
            ...booking,
            teamStaffIds
          };
        });

        setAllBookingsOnDate(bookingsWithTeam);

        // SECURITY: Fetch working hours only for staff in this organization
        const client: any = supabase;
        const { data: hoursData, error: hoursError } = await client
          .from('working_hours')
          .select('staff_id, day_of_week, start_time, end_time, is_available')
          .in('staff_id', 
            await supabase
              .from('staff')
              .select('id')
              .eq('organization_id', organizationId)
              .eq('is_active', true)
              .then(r => (r.data || []).map((s: { id: string }) => s.id))
          );

        if (hoursError) throw hoursError;
        setWorkingHours(hoursData || []);

        // Approved time-off requests overlapping the selected date
        // Org day, not the device's — this keys a time-off lookup that must agree
    // with the booking window above.
    const dateStr = orgDateKey(new Date(selectedDate), orgTimezone);
        const { data: toData } = await (supabase as any)
          .from('time_off_requests')
          .select('staff_id')
          .eq('organization_id', organizationId)
          .eq('status', 'approved')
          .lte('start_date', dateStr)
          .gte('end_date', dateStr);
        setTimeOffStaffIds(new Set((toData || []).map((r: any) => r.staff_id)));

      } catch (error) {
        console.error('Error fetching bookings/working hours for conflicts:', error);
        setAllBookingsOnDate([]);
        setWorkingHours([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  // toDateString() here is only a memo KEY — a stable string identifying the
  // picked calendar day so the query refetches when it changes. Nothing is
  // computed from it; the conflict window itself is org-resolved above.
  /* eslint-disable-next-line local/no-device-local-dates -- memo key, not a computed boundary */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedDate is compared via toDateString(); complex expression is intentional for day-level change detection
  }, [selectedDate?.toDateString(), organizationId, orgTimezone]);

  // Check if staff is within their working hours for the selected date/time
  // Returns false ONLY if the staff has working hours configured AND the day is explicitly blocked/unavailable
  // If no working hours configured at all → show the staff (don't hide)
  // If no schedule for this specific day → show the staff (don't hide due to missing config)
  // Only hide if the day is explicitly marked is_available = false
  const isStaffWithinWorkingHours = useCallback((staffId: string): boolean => {
    if (!selectedDate || !selectedTime) return true; // Assume available if no date/time

    const dayOfWeek = getDay(selectedDate); // 0 = Sunday, 6 = Saturday
    const staffWorkingHours = workingHours.filter(wh => wh.staff_id === staffId);
    
    // If no working hours configured at all, always show (assume available)
    if (staffWorkingHours.length === 0) return true;

    const daySchedule = staffWorkingHours.find(wh => wh.day_of_week === dayOfWeek);
    
    // If no schedule entry for this specific day, don't hide the staff
    // They may simply not have configured this day - default to showing them
    if (!daySchedule) return true;

    // Only hide if the day is EXPLICITLY marked as unavailable
    if (!daySchedule.is_available) return false;

    // Day is marked available - check if selected time falls within working hours
    const [selectedHour, selectedMinute] = selectedTime.split(':').map(Number);
    const selectedMinutes = selectedHour * 60 + selectedMinute;

    const [startHour, startMin] = daySchedule.start_time.split(':').map(Number);
    const [endHour, endMin] = daySchedule.end_time.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // If start/end times are both 0 (not properly configured), don't hide
    if (startMinutes === 0 && endMinutes === 0) return true;

    // Check if the booking START time falls within working hours
    // We don't block on booking end time going over - admin can override that
    return selectedMinutes >= startMinutes && selectedMinutes < endMinutes;
  }, [selectedDate, selectedTime, workingHours]);

  // Check conflicts for a specific staff member
  const checkConflictsForStaff = useCallback((staffId: string): ConflictInfo[] => {
    if (!selectedDate || !selectedTime || !staffId) {
      return [];
    }

    const [hours, minutes] = selectedTime.split(':').map(Number);
    // Org-local, matching the fetch window. These were left device-local when
    // the window moved to org time, so the two halves of the check could point
    // at different calendar days — the fetched bookings would not contain the
    // day the candidate is actually on, and a real clash returned "no
    // conflict". Before that change both were device-local and at least
    // self-consistent; half-converting made it worse than the bug it fixed.
    const { y, m, d } = orgYMD(new Date(selectedDate), orgTimezone);
    const newBookingStart = orgSetTimeOnDay(y, m, d, hours, minutes, orgTimezone);
    const newBookingEnd = new Date(newBookingStart.getTime() + duration * 60 * 1000);

    const conflicts: ConflictInfo[] = [];

    for (const booking of allBookingsOnDate) {
      // Skip the current booking if editing
      if (currentBookingId && booking.id === currentBookingId) continue;

      // Check if this booking involves the staff member (primary or team)
      const isAssigned = booking.staff_id === staffId || 
                         (booking.teamStaffIds && booking.teamStaffIds.includes(staffId));
      
      if (!isAssigned) continue;

      const existingStart = parseISO(booking.scheduled_at);
      const existingEnd = new Date(existingStart.getTime() + (booking.duration || 120) * 60 * 1000);

      // Check for direct overlap
      const hasOverlap = 
        (newBookingStart < existingEnd && newBookingEnd > existingStart);

      // Check for proximity (within 60 minutes)
      let minutesApart = 0;
      let isProximity = false;

      if (!hasOverlap) {
        if (newBookingStart >= existingEnd) {
          minutesApart = differenceInMinutes(newBookingStart, existingEnd);
        } else if (newBookingEnd <= existingStart) {
          minutesApart = differenceInMinutes(existingStart, newBookingEnd);
        }
        isProximity = minutesApart < TRAVEL_BUFFER_MINUTES;
      }

      if (hasOverlap || isProximity) {
        const customerName = booking.customer 
          ? `${booking.customer.first_name} ${booking.customer.last_name}` 
          : 'Unknown';

        conflicts.push({
          bookingId: booking.id,
          bookingNumber: booking.booking_number,
          scheduledAt: booking.scheduled_at,
          duration: booking.duration || 120,
          customerName,
          serviceName: booking.service?.name || 'Cleaning',
          overlapType: hasOverlap ? 'overlap' : 'proximity',
          minutesApart: hasOverlap ? 0 : minutesApart
        });
      }
    }

    return conflicts;
  }, [allBookingsOnDate, selectedDate, selectedTime, duration, currentBookingId, orgTimezone]);

  // Get availability status for all staff - now includes working hours check
  const getStaffAvailability = useCallback((staffIds: string[]): Map<string, StaffAvailability> => {
    const availabilityMap = new Map<string, StaffAvailability>();

    for (const staffId of staffIds) {
      const conflicts = checkConflictsForStaff(staffId);
      const isWithinWorkingHours = isStaffWithinWorkingHours(staffId);
      const isOnTimeOff = timeOffStaffIds.has(staffId);

      availabilityMap.set(staffId, {
        staffId,
        isAvailable: conflicts.length === 0 && isWithinWorkingHours && !isOnTimeOff,
        conflicts,
        isOutsideWorkingHours: !isWithinWorkingHours || isOnTimeOff,
      });
    }

    return availabilityMap;
  }, [checkConflictsForStaff, isStaffWithinWorkingHours, timeOffStaffIds]);


  return {
    loading,
    checkConflictsForStaff,
    getStaffAvailability,
    isStaffWithinWorkingHours,
    allBookingsOnDate
  };
}
