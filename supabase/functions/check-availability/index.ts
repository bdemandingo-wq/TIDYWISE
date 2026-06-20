import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Check availability for a given organization + date.
 * Returns 30-minute time slots with availability status.
 *
 * Input: { organization_id, date (YYYY-MM-DD), service_id? }
 * Output: { slots: [{ time: "09:00", available: boolean }], timezone: string }
 */
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { organization_id, date, service_id } = await req.json();

    if (!organization_id || !date) {
      return new Response(
        JSON.stringify({ error: "organization_id and date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get org business settings (timezone, buffer, business hours)
    const { data: bizSettings } = await supabase
      .from('business_settings')
      .select('timezone, booking_buffer_minutes, minimum_notice_hours')
      .eq('organization_id', organization_id)
      .maybeSingle();

    const orgTimezone = bizSettings?.timezone || 'America/New_York';
    const bufferMinutes = bizSettings?.booking_buffer_minutes || 0;
    const minimumNoticeHours = bizSettings?.minimum_notice_hours || 0;

    // 2. Get service duration if specified
    let serviceDuration = 120; // default 2 hours
    if (service_id) {
      const { data: svc } = await supabase
        .from('services')
        .select('duration')
        .eq('id', service_id)
        .eq('organization_id', organization_id)
        .maybeSingle();
      if (svc?.duration) serviceDuration = svc.duration;
    }

    // 3. Parse the requested date and find day_of_week (0=Sun, 6=Sat)
    // The date string is in the ORG timezone context
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay(); // 0=Sun

    // 4. Get all active staff for this org
    const { data: staffList } = await supabase
      .from('staff')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('is_active', true);

    const staffIds = (staffList || []).map((s: any) => s.id);

    if (staffIds.length === 0) {
      // No staff = no availability
      return new Response(
        JSON.stringify({ slots: [], timezone: orgTimezone }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Get working hours for this day_of_week for all active staff
    const { data: workingHours } = await supabase
      .from('working_hours')
      .select('staff_id, start_time, end_time, is_available')
      .in('staff_id', staffIds)
      .eq('day_of_week', dayOfWeek);

    // Build map: staff_id -> { start_time, end_time, is_available }
    const staffSchedules = new Map<string, { start: string; end: string }>();
    for (const wh of (workingHours || [])) {
      if (wh.is_available && wh.staff_id) {
        staffSchedules.set(wh.staff_id, { start: wh.start_time, end: wh.end_time });
      }
    }

    // Staff without explicit working hours for this day are treated as unavailable
    // (per staff-availability-filtering-policy: hidden only if explicitly unavailable)
    // For public booking, we'll be conservative: only show slots where staff have explicit hours

    if (staffSchedules.size === 0) {
      return new Response(
        JSON.stringify({ slots: [], timezone: orgTimezone }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Find the widest window across all available staff
    let earliestStart = 24 * 60;
    let latestEnd = 0;
    for (const [, sched] of staffSchedules) {
      const [sh, sm] = sched.start.split(':').map(Number);
      const [eh, em] = sched.end.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      if (startMin < earliestStart) earliestStart = startMin;
      if (endMin > latestEnd) latestEnd = endMin;
    }

    // 7. Get existing bookings for this date (in org timezone)
    // Convert the date boundaries to UTC for querying
    const startOfDayUTC = orgTimeToUTC(year, month - 1, day, 0, 0, orgTimezone);
    const endOfDayUTC = orgTimeToUTC(year, month - 1, day, 23, 59, orgTimezone);

    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('id, staff_id, scheduled_at, duration')
      .eq('organization_id', organization_id)
      .in('status', ['pending', 'confirmed', 'in_progress'])
      .gte('scheduled_at', startOfDayUTC)
      .lte('scheduled_at', endOfDayUTC);

    // Also get team assignments for these bookings
    const bookingIds = (existingBookings || []).map((b: any) => b.id).filter(Boolean);
    let teamAssignments: any[] = [];
    if (bookingIds.length > 0) {
      const { data: teams } = await supabase
        .from('booking_team_assignments')
        .select('booking_id, staff_id')
        .in('booking_id', bookingIds);
      teamAssignments = teams || [];
    }

    // Build a map of staff -> booked time ranges (in org timezone minutes)
    const staffBookedRanges = new Map<string, Array<{ start: number; end: number }>>();
    // Global booked ranges: bookings with no assignable staff still consume org capacity
    const globalBookedRanges: Array<{ start: number; end: number }> = [];

    for (const booking of (existingBookings || [])) {
      const bookingTime = getTimeInTimezoneMinutes(booking.scheduled_at, orgTimezone);
      const bookingEnd = bookingTime + (booking.duration || 120) + bufferMinutes;
      const range = { start: bookingTime, end: bookingEnd };

      // Always count toward global capacity
      globalBookedRanges.push(range);

      // Assign to primary staff
      if (booking.staff_id) {
        if (!staffBookedRanges.has(booking.staff_id)) staffBookedRanges.set(booking.staff_id, []);
        staffBookedRanges.get(booking.staff_id)!.push(range);
      }
    }

    // Also assign team members
    for (const ta of teamAssignments) {
      const booking = (existingBookings || []).find((b: any) => b.id === ta.booking_id);
      if (booking && ta.staff_id) {
        const bookingTime = getTimeInTimezoneMinutes(booking.scheduled_at, orgTimezone);
        const bookingEnd = bookingTime + (booking.duration || 120) + bufferMinutes;
        if (!staffBookedRanges.has(ta.staff_id)) staffBookedRanges.set(ta.staff_id, []);
        staffBookedRanges.get(ta.staff_id)!.push({ start: bookingTime, end: bookingEnd });
      }
    }

    // Total active staff count = max concurrent jobs the org can take
    const totalStaffCapacity = staffIds.length;

    // 8. Generate 30-minute slots and check availability
    const now = new Date();
    const nowInOrgTZ = getTimeInTimezoneMinutes(now.toISOString(), orgTimezone);
    const todayInOrgTZ = getDateInTimezone(now.toISOString(), orgTimezone);
    const isToday = todayInOrgTZ === date;

    const slots: Array<{ time: string; available: boolean }> = [];

    for (let slotMin = earliestStart; slotMin + serviceDuration <= latestEnd; slotMin += 30) {
      const slotEnd = slotMin + serviceDuration;
      const timeStr = `${String(Math.floor(slotMin / 60)).padStart(2, '0')}:${String(slotMin % 60).padStart(2, '0')}`;

      // Check minimum notice
      if (isToday && slotMin <= nowInOrgTZ + (minimumNoticeHours * 60)) {
        slots.push({ time: timeStr, available: false });
        continue;
      }

      // Global capacity check: if concurrent bookings >= total staff, block the slot
      const overlappingBookings = globalBookedRanges.filter(r => slotMin < r.end && slotEnd > r.start).length;
      if (overlappingBookings >= totalStaffCapacity) {
        slots.push({ time: timeStr, available: false });
        continue;
      }

      // Check if ANY available staff can take this slot
      let anyStaffAvailable = false;

      for (const [staffId, sched] of staffSchedules) {
        const [sh, sm] = sched.start.split(':').map(Number);
        const [eh, em] = sched.end.split(':').map(Number);
        const schedStart = sh * 60 + sm;
        const schedEnd = eh * 60 + em;

        // Slot must fit within this staff's schedule
        if (slotMin < schedStart || slotEnd > schedEnd) continue;

        // Check conflicts with existing bookings for this staff
        const ranges = staffBookedRanges.get(staffId) || [];
        const hasConflict = ranges.some(r => slotMin < r.end && slotEnd > r.start);

        if (!hasConflict) {
          anyStaffAvailable = true;
          break;
        }
      }

      slots.push({ time: timeStr, available: anyStaffAvailable });
    }


    return new Response(
      JSON.stringify({ slots, timezone: orgTimezone }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[check-availability] Error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// --- Timezone helpers (same logic as frontend timezoneUtils.ts) ---

function orgTimeToUTC(
  year: number, month: number, day: number, hours: number, minutes: number, timezone: string
): string {
  const fakeUTC = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
  const inTZ = new Date(fakeUTC.toLocaleString('en-US', { timeZone: timezone }));
  const inUTC = new Date(fakeUTC.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = inTZ.getTime() - inUTC.getTime();
  return new Date(fakeUTC.getTime() - offsetMs).toISOString();
}

function getTimeInTimezoneMinutes(isoString: string, timezone: string): number {
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = parseInt(parts.find(p => p.type === 'hour')!.value);
  const minute = parseInt(parts.find(p => p.type === 'minute')!.value);
  const normalizedHour = hour === 24 ? 0 : hour;
  return normalizedHour * 60 + minute;
}

function getDateInTimezone(isoString: string, timezone: string): string {
  const d = new Date(isoString);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const dayPart = parts.find(p => p.type === 'day')!.value;
  return `${year}-${month}-${dayPart}`;
}