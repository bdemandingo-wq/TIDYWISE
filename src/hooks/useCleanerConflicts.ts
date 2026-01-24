import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { differenceInMinutes, parseISO, format, isSameDay } from 'date-fns';

export interface ConflictInfo {
  bookingId: string;
  bookingNumber: number;
  scheduledAt: string;
  duration: number;
  customerName: string;
  serviceName: string;
  overlapType: 'overlap' | 'proximity';
  minutesApart: number;
}

export interface StaffAvailability {
  staffId: string;
  isAvailable: boolean;
  conflicts: ConflictInfo[];
}

const TRAVEL_BUFFER_MINUTES = 60;

export function useCleanerConflicts(
  selectedDate: Date | undefined,
  selectedTime: string,
  duration: number = 120, // default 2 hours
  currentBookingId?: string // Exclude this booking when editing
) {
  const [allBookingsOnDate, setAllBookingsOnDate] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch bookings for the selected date
  useEffect(() => {
    if (!selectedDate) {
      setAllBookingsOnDate([]);
      return;
    }

    const fetchBookings = async () => {
      setLoading(true);
      try {
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        const { data, error } = await supabase
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
          .gte('scheduled_at', startOfDay.toISOString())
          .lte('scheduled_at', endOfDay.toISOString())
          .not('status', 'in', '("cancelled","no_show")');

        if (error) throw error;

        // Also fetch team assignments
        const { data: teamAssignments } = await supabase
          .from('booking_team_assignments')
          .select('booking_id, staff_id');

        // Merge team assignments into bookings
        const bookingsWithTeam = (data || []).map(booking => {
          const teamStaffIds = (teamAssignments || [])
            .filter(t => t.booking_id === booking.id)
            .map(t => t.staff_id);
          return {
            ...booking,
            teamStaffIds
          };
        });

        setAllBookingsOnDate(bookingsWithTeam);
      } catch (error) {
        console.error('Error fetching bookings for conflicts:', error);
        setAllBookingsOnDate([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, [selectedDate?.toDateString()]);

  // Check conflicts for a specific staff member
  const checkConflictsForStaff = useCallback((staffId: string): ConflictInfo[] => {
    if (!selectedDate || !selectedTime || !staffId) {
      return [];
    }

    const [hours, minutes] = selectedTime.split(':').map(Number);
    const newBookingStart = new Date(selectedDate);
    newBookingStart.setHours(hours, minutes, 0, 0);
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
  }, [allBookingsOnDate, selectedDate, selectedTime, duration, currentBookingId]);

  // Get availability status for all staff
  const getStaffAvailability = useCallback((staffIds: string[]): Map<string, StaffAvailability> => {
    const availabilityMap = new Map<string, StaffAvailability>();

    for (const staffId of staffIds) {
      const conflicts = checkConflictsForStaff(staffId);
      availabilityMap.set(staffId, {
        staffId,
        isAvailable: conflicts.length === 0,
        conflicts
      });
    }

    return availabilityMap;
  }, [checkConflictsForStaff]);

  return {
    loading,
    checkConflictsForStaff,
    getStaffAvailability,
    allBookingsOnDate
  };
}
