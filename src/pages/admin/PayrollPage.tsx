import { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { SubscriptionGate } from '@/components/admin/SubscriptionGate';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, startOfYear, startOfWeek } from 'date-fns';
import { CalendarIcon, Download, AlertTriangle, DollarSign, Clock, Calculator, Briefcase, Check, AlertCircle, ExternalLink, TrendingUp, TrendingDown, Percent, BarChart3, Lock, Unlock, Shield, History, Trophy, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrgId } from '@/hooks/useOrgId';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { calculateBookingWage } from '@/lib/wageCalculation';
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
interface StaffWithPayroll {
  id: string;
  name: string;
  email: string;
  tax_classification: string | null;
  base_wage: number | null;
  hourly_rate: number | null;
  totalHours: number;
  totalPay: number;
  ytdEarnings: number;
  requiresTaxFiling: boolean;
  upcomingBookings: number;
  assignedCleans: number;
  avgPayPerClean: number;
  missingPayCount: number;
}

interface BookingPayrollDetail {
  id: string;
  booking_number: number;
  customer_name: string;
  scheduled_at: string;
  duration: number;
  hours_worked: number;
  wage_type: string;
  wage_rate: number;
  calculated_pay: number;
  actual_pay: number | null;
  staff_id: string;
  staff_name: string;
  missingPay: boolean;
  missingHours: boolean;
}

export default function PayrollPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [showMissingPayOnly, setShowMissingPayOnly] = useState(false);
  const [activePayrollTab, setActivePayrollTab] = useState('summary');
  const [staffFilterId, setStaffFilterId] = useState<string>('all');
  const { isTestMode, maskName, maskEmail } = useTestMode();
  const { organizationId } = useOrgId();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [lockAction, setLockAction] = useState<'lock' | 'unlock'>('lock');

  // Calculate week start for current date range (for weekly reset)
  const weekStart = format(startOfWeek(dateRange.from, { weekStartsOn: 1 }), 'yyyy-MM-dd');

  // Fetch paid staff for current week
  const { data: paidPayments = [] } = useQuery({
    queryKey: ['payroll-payments', organizationId, weekStart],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('payroll_payments')
        .select('staff_id')
        .eq('organization_id', organizationId)
        .eq('week_start', weekStart);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const paidStaffIds = new Set(paidPayments.map(p => p.staff_id));

  // Mark paid mutation
  const markPaidMutation = useMutation({
    mutationFn: async ({ staffId, staffName, isPaid, amount }: { staffId: string; staffName: string; isPaid: boolean; amount?: number }) => {
      if (!organizationId || !user) throw new Error('Missing context');
      
      if (isPaid) {
        // Remove paid status
        const { error } = await supabase
          .from('payroll_payments')
          .delete()
          .eq('organization_id', organizationId)
          .eq('staff_id', staffId)
          .eq('week_start', weekStart);
        if (error) throw error;
        return { staffName, isPaid: false };
      } else {
        // Add paid status
        const { error } = await supabase
          .from('payroll_payments')
          .insert({
            organization_id: organizationId,
            staff_id: staffId,
            week_start: weekStart,
            paid_by: user.id,
            amount: amount || null,
          });
        if (error) throw error;
        return { staffName, isPaid: true };
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payroll-payments'] });
      if (data.isPaid) {
        toast.success(`${data.staffName} marked as paid`);
      } else {
        toast.info(`${data.staffName} marked as unpaid`);
      }
    },
    onError: () => {
      toast.error('Failed to update payment status');
    },
  });

  const handleMarkPaid = (staffId: string, staffName: string, amount?: number) => {
    const isPaid = paidStaffIds.has(staffId);
    markPaidMutation.mutate({ staffId, staffName, isPaid, amount });
  };

  // Fetch staff
  const { data: staff = [] } = useQuery({
    queryKey: ['staff-payroll', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch ALL bookings for selected date range (not just completed) to include all staff
  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings-payroll', dateRange, organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const toEndOfDay = new Date(dateRange.to);
      toEndOfDay.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers(*),
          staff:staff(*)
        `)
        .eq('organization_id', organizationId)
        .gte('scheduled_at', dateRange.from.toISOString())
        .lte('scheduled_at', toEndOfDay.toISOString())
        .order('scheduled_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch team assignments for the date range bookings (to capture team member pay)
  const { data: teamAssignments = [] } = useQuery({
    queryKey: ['team-assignments-payroll', dateRange, organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const toEndOfDay = new Date(dateRange.to);
      toEndOfDay.setHours(23, 59, 59, 999);
      // Get all team assignments for bookings in the date range (exclude cancelled)
      const { data: bookingIds } = await supabase
        .from('bookings')
        .select('id')
        .eq('organization_id', organizationId)
        .neq('status', 'cancelled')
        .gte('scheduled_at', dateRange.from.toISOString())
        .lte('scheduled_at', toEndOfDay.toISOString());
      if (!bookingIds?.length) return [];
      const ids = bookingIds.map((b: any) => b.id);
      const { data, error } = await supabase
        .from('booking_team_assignments')
        .select('*')
        .eq('organization_id', organizationId)
        .in('booking_id', ids);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  // Fetch YTD bookings for 1099 threshold
  const { data: ytdBookings = [] } = useQuery({
    queryKey: ['bookings-ytd', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const yearStart = startOfYear(new Date());
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'completed')
        .gte('scheduled_at', yearStart.toISOString());
      if (error) throw error;
      return data;
    },
  });

  // Fetch YTD team assignments for 1099 threshold
  const { data: ytdTeamAssignments = [] } = useQuery({
    queryKey: ['team-assignments-ytd', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const yearStart = startOfYear(new Date());
      const { data: bookingIds } = await supabase
        .from('bookings')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('status', 'completed')
        .gte('scheduled_at', yearStart.toISOString());
      if (!bookingIds?.length) return [];
      const ids = bookingIds.map((b: any) => b.id);
      const { data, error } = await supabase
        .from('booking_team_assignments')
        .select('*')
        .eq('organization_id', organizationId)
        .in('booking_id', ids);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  // --- Pay Lock ---
  // Count how many bookings in the period are locked
  const lockedBookingIds = useMemo(() => {
    return bookings.filter((b: any) => b.pay_locked === true && b.status !== 'cancelled').map((b: any) => b.id);
  }, [bookings]);

  const totalLockableBookings = bookings.filter((b: any) => b.status !== 'cancelled' && b.staff_id).length;
  const isFullyLocked = totalLockableBookings > 0 && lockedBookingIds.length === totalLockableBookings;
  const isPartiallyLocked = lockedBookingIds.length > 0 && !isFullyLocked;

  // Lock/Unlock period mutation
  const lockPeriodMutation = useMutation({
    mutationFn: async (action: 'lock' | 'unlock') => {
      if (!organizationId || !user) throw new Error('Missing context');
      const toEndOfDay = new Date(dateRange.to);
      toEndOfDay.setHours(23, 59, 59, 999);
      const targetIds = bookings
        .filter((b: any) => b.status !== 'cancelled' && b.staff_id)
        .map((b: any) => b.id);
      if (targetIds.length === 0) throw new Error('No bookings to lock');

      // Update all bookings in the period
      const { error } = await supabase
        .from('bookings')
        .update({ pay_locked: action === 'lock' })
        .eq('organization_id', organizationId)
        .in('id', targetIds);
      if (error) throw error;

      // Log the action
      const { error: logError } = await supabase
        .from('payroll_audit_log')
        .insert({
          organization_id: organizationId,
          user_id: user.id,
          action: action === 'lock' ? 'period_locked' : 'period_unlocked',
          period_start: format(dateRange.from, 'yyyy-MM-dd'),
          period_end: format(dateRange.to, 'yyyy-MM-dd'),
          details: {
            booking_count: targetIds.length,
            total_payroll: totalPayroll,
            total_revenue: totalRevenue,
          },
          affected_booking_ids: targetIds,
        });
      if (logError) console.error('Audit log error:', logError);

      return { action, count: targetIds.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bookings-payroll'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-audit-log'] });
      toast.success(
        data.action === 'lock'
          ? `🔒 Period locked — ${data.count} booking(s) frozen`
          : `🔓 Period unlocked — ${data.count} booking(s) editable`
      );
    },
    onError: () => toast.error('Failed to update lock status'),
  });

  // Audit log query
  const { data: auditLog = [] } = useQuery({
    queryKey: ['payroll-audit-log', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('payroll_audit_log')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });


  // Priority (highest to lowest):
  //  1. pay_share on team assignment — per-person override (team bookings)
  //  2. booking.cleaner_pay_expected — snapshot computed on save
  //  3. booking.cleaner_actual_payment — admin override
  //  4. standard wage formula via calculateBookingWage (fallback to staff defaults)
  const calcWage = (booking: any, staffMember: any, payShareOverride?: number | null) => {
    const baseResult = calculateBookingWage(booking, staffMember);

    // 1. per-person pay_share wins ONLY when > 0 (0 means "not set", not "zero pay")
    if (payShareOverride != null && Number(payShareOverride) > 0) {
      return {
        calculatedPay: Number(payShareOverride),
        actualPay: Number(payShareOverride),
        wageType: booking.cleaner_wage_type || 'actual',
        wageRate: booking.cleaner_wage || Number(payShareOverride),
        hoursWorked: baseResult.hoursWorked,
      };
    }
    // 2. booking-level cleaner_pay_expected snapshot
    //    For hourly wage types, recalculate from rate × current hours to avoid stale snapshots
    if (booking.cleaner_pay_expected != null && Number(booking.cleaner_pay_expected) > 0) {
      const snapshotWageType = booking.cleaner_wage_type || 'hourly';
      const snapshotHours = booking.cleaner_override_hours || baseResult.hoursWorked;
      const snapshotRate = booking.cleaner_wage || staffMember?.hourly_rate || staffMember?.base_wage || 0;
      
      // For hourly, recalculate using current hours × rate to stay accurate
      if (snapshotWageType === 'hourly' && snapshotRate > 0) {
        const recalcPay = Math.round(Number(snapshotRate) * snapshotHours * 100) / 100;
        return {
          calculatedPay: recalcPay,
          actualPay: recalcPay,
          wageType: snapshotWageType,
          wageRate: Number(snapshotRate),
          hoursWorked: snapshotHours,
        };
      }
      
      // For flat/percentage, trust the snapshot
      return {
        calculatedPay: Number(booking.cleaner_pay_expected),
        actualPay: Number(booking.cleaner_pay_expected),
        wageType: snapshotWageType,
        wageRate: booking.cleaner_wage || Number(booking.cleaner_pay_expected),
        hoursWorked: snapshotHours,
      };
    }
    // 3. booking-level cleaner_actual_payment (admin override)
    if (booking.cleaner_actual_payment != null) {
      return {
        calculatedPay: Number(booking.cleaner_actual_payment),
        actualPay: Number(booking.cleaner_actual_payment),
        wageType: 'actual',
        wageRate: Number(booking.cleaner_actual_payment),
        hoursWorked: baseResult.hoursWorked,
      };
    }
    // 4. standard formula — fallback to staff defaults
    return {
      calculatedPay: baseResult.calculatedPay,
      actualPay: null,
      wageType: baseResult.wageType,
      wageRate: baseResult.wageRate,
      hoursWorked: baseResult.hoursWorked,
    };
  };

  // Helper: get all pay entries for a staff member across primary + team roles
  const getStaffPayEntries = (staffId: string, bookingList: any[], assignmentList: any[]) => {
    const entries: { booking: any; pay: number; hours: number; missingPay: boolean }[] = [];
    const staffMember = staff.find((s) => s.id === staffId);

    const primaryBookings = bookingList.filter((b: any) => b.staff_id === staffId && b.status !== 'cancelled');
    for (const b of primaryBookings) {
      const assignment = assignmentList.find((a: any) => a.booking_id === b.id && a.staff_id === staffId);
      const payShareOverride = assignment?.pay_share != null ? Number(assignment.pay_share) : null;
      const wageInfo = calcWage(b, staffMember, payShareOverride);
      const missingPay = wageInfo.calculatedPay === 0 && b.cleaner_pay_expected == null && b.cleaner_actual_payment == null;
      entries.push({ booking: b, pay: wageInfo.calculatedPay, hours: wageInfo.hoursWorked, missingPay });
    }

    const teamEntries = assignmentList.filter((a: any) => a.staff_id === staffId && !primaryBookings.find((b: any) => b.id === a.booking_id));
    for (const a of teamEntries) {
      const booking = bookingList.find((b: any) => b.id === a.booking_id && b.status !== 'cancelled');
      if (!booking) continue;
      const payShareOverride = a.pay_share != null ? Number(a.pay_share) : null;
      const wageInfo = calcWage(booking, staffMember, payShareOverride);
      const missingPay = wageInfo.calculatedPay === 0 && booking.cleaner_pay_expected == null && booking.cleaner_actual_payment == null;
      entries.push({ booking, pay: wageInfo.calculatedPay, hours: wageInfo.hoursWorked, missingPay });
    }

    return entries;
  };

  // Detailed booking payroll breakdown
  const bookingPayrollDetails: BookingPayrollDetail[] = useMemo(() => {
    const details: BookingPayrollDetail[] = [];
    const assignedBookings = bookings.filter((b: any) => b.status !== 'cancelled' && b.staff_id);

    for (const b of assignedBookings) {
      const staffMember = staff.find((s) => s.id === b.staff_id);
      // Find team assignments for this booking
      const assignments = teamAssignments.filter((a: any) => a.booking_id === b.id);

      if (assignments.length > 0) {
        // Add a row per team member
        for (const a of assignments) {
          const member = staff.find((s) => s.id === a.staff_id);
          const payShareOverride = a.pay_share != null ? Number(a.pay_share) : null;
          const wageInfo = calcWage(b, member, payShareOverride);
          const isMissingPay = wageInfo.calculatedPay === 0 && b.cleaner_pay_expected == null;
          const isMissingHours = (b.cleaner_wage_type || wageInfo.wageType) === 'hourly' && !b.cleaner_override_hours && !b.cleaner_checkin_at;
          details.push({
            id: `${b.id}-${a.staff_id}`,
            booking_number: b.booking_number,
            customer_name: b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown',
            scheduled_at: b.scheduled_at,
            duration: b.duration,
            hours_worked: b.cleaner_override_hours || wageInfo.hoursWorked,
            wage_type: b.cleaner_wage_type || wageInfo.wageType,
            wage_rate: b.cleaner_wage || wageInfo.wageRate,
            calculated_pay: wageInfo.calculatedPay,
            actual_pay: wageInfo.actualPay,
            staff_id: a.staff_id,
            staff_name: member?.name || staffMember?.name || 'Unassigned',
            missingPay: isMissingPay,
            missingHours: isMissingHours,
          });
        }
      } else {
        // Single cleaner
        const wageInfo = calcWage(b, staffMember);
        const isMissingPay = wageInfo.calculatedPay === 0 && b.cleaner_pay_expected == null;
        const isMissingHours = (b.cleaner_wage_type || wageInfo.wageType) === 'hourly' && !b.cleaner_override_hours && !b.cleaner_checkin_at;
        details.push({
          id: b.id,
          booking_number: b.booking_number,
          customer_name: b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown',
          scheduled_at: b.scheduled_at,
          duration: b.duration,
          hours_worked: b.cleaner_override_hours || wageInfo.hoursWorked,
          wage_type: b.cleaner_wage_type || wageInfo.wageType,
          wage_rate: b.cleaner_wage || wageInfo.wageRate,
          calculated_pay: wageInfo.calculatedPay,
          actual_pay: wageInfo.actualPay,
          staff_id: b.staff_id,
          staff_name: staffMember?.name || 'Unassigned',
          missingPay: isMissingPay,
          missingHours: isMissingHours,
        });
      }
    }
    return details;
  }, [bookings, staff, teamAssignments]);

  const filteredBookingPayrollDetails = useMemo(() => {
    let filtered = bookingPayrollDetails;
    if (staffFilterId !== 'all') {
      filtered = filtered.filter((d) => d.staff_id === staffFilterId);
    }
    if (showMissingPayOnly) {
      filtered = filtered.filter((d) => d.missingPay || d.missingHours);
    }
    return filtered;
  }, [bookingPayrollDetails, staffFilterId, showMissingPayOnly]);

  // Calculate payroll data - include ALL staff, even those without bookings
  // Correctly accounts for both primary staff and team member assignments
  const payrollData: StaffWithPayroll[] = useMemo(() => {
    return staff.map((s) => {
      const entries = getStaffPayEntries(s.id, bookings, teamAssignments);
      const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
      const totalPay = entries.reduce((sum, e) => sum + e.pay, 0);

      // YTD: same logic using ytd data
      const ytdEntries = getStaffPayEntries(s.id, ytdBookings, ytdTeamAssignments);
      const ytdEarnings = ytdEntries.reduce((sum, e) => sum + e.pay, 0);

      // Count upcoming bookings for this staff (primary or team)
      const upcomingPrimary = bookings.filter((b: any) =>
        b.staff_id === s.id && !['completed', 'cancelled', 'no_show'].includes(b.status)
      ).length;
      const upcomingTeam = teamAssignments.filter((a: any) => {
        if (a.staff_id !== s.id) return false;
        const b = bookings.find((bk: any) => bk.id === a.booking_id);
        return b && !['completed', 'cancelled', 'no_show'].includes(b.status);
      }).length;
      const upcomingBookings = upcomingPrimary + upcomingTeam;

      const requiresTaxFiling = s.tax_classification === '1099' && ytdEarnings >= 600;
      const assignedCleans = entries.length;
      const avgPayPerClean = assignedCleans > 0 ? totalPay / assignedCleans : 0;
      const missingPayCount = entries.filter(e => e.missingPay).length;

      return {
        id: s.id,
        name: s.name,
        email: s.email,
        tax_classification: s.tax_classification,
        base_wage: s.base_wage,
        hourly_rate: s.hourly_rate,
        totalHours: Math.round(totalHours * 100) / 100,
        totalPay: Math.round(totalPay * 100) / 100,
        ytdEarnings: Math.round(ytdEarnings * 100) / 100,
        requiresTaxFiling,
        upcomingBookings,
        assignedCleans,
        avgPayPerClean: Math.round(avgPayPerClean * 100) / 100,
        missingPayCount,
      };
    });
  }, [staff, bookings, ytdBookings, teamAssignments, ytdTeamAssignments]);

  // Summary stats
  const totalPayroll = payrollData.reduce((sum, s) => sum + s.totalPay, 0);
  const totalHours = payrollData.reduce((sum, s) => sum + s.totalHours, 0);
  const totalCleans = payrollData.reduce((sum, s) => sum + s.assignedCleans, 0);
  const contractorsNeedingFiling = payrollData.filter((s) => s.requiresTaxFiling).length;
  const avgPayPerClean = totalCleans > 0 ? totalPayroll / totalCleans : 0;
  const totalMissingPay = bookingPayrollDetails.filter(d => d.missingPay).length;

  // --- Financial Intelligence ---
  const nonCancelledBookings = bookings.filter((b: any) => b.status !== 'cancelled');
  const totalRevenue = nonCancelledBookings.reduce((sum: number, b: any) => sum + (Number(b.total_amount) || 0), 0);
  const totalProfit = totalRevenue - totalPayroll;
  const profitMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const laborCostPct = totalRevenue > 0 ? (totalPayroll / totalRevenue) * 100 : 0;
  const isLowMargin = profitMarginPct < 30 && totalRevenue > 0;

  // Per-booking profitability for the financial overview tab
  const bookingProfitability = useMemo(() => {
    return nonCancelledBookings
      .filter((b: any) => b.staff_id)
      .map((b: any) => {
        const revenue = Number(b.total_amount) || 0;
        // Sum all labor costs for this booking (team or single)
        const assignments = teamAssignments.filter((a: any) => a.booking_id === b.id);
        let laborCost = 0;
        if (assignments.length > 0) {
          for (const a of assignments) {
            const member = staff.find((s) => s.id === a.staff_id);
            const payShare = a.pay_share != null ? Number(a.pay_share) : null;
            const wageInfo = calcWage(b, member, payShare);
            laborCost += wageInfo.calculatedPay;
          }
        } else {
          const staffMember = staff.find((s) => s.id === b.staff_id);
          const wageInfo = calcWage(b, staffMember);
          laborCost = wageInfo.calculatedPay;
        }
        const profit = revenue - laborCost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        return {
          id: b.id,
          booking_number: b.booking_number,
          customer_name: b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown',
          scheduled_at: b.scheduled_at,
          revenue,
          laborCost,
          profit,
          margin,
        };
      })
      .sort((a, b) => a.margin - b.margin);
  }, [nonCancelledBookings, teamAssignments, staff]);

  // --- Staff Efficiency Rankings ---
  const staffEfficiency = useMemo(() => {
    return staff
      .map((s) => {
        const entries = getStaffPayEntries(s.id, bookings, teamAssignments);
        const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
        const totalPay = entries.reduce((sum, e) => sum + e.pay, 0);
        const cleans = entries.length;

        // Revenue generated by this staff member's bookings
        let totalRevGenerated = 0;
        let totalLaborCost = 0;
        for (const e of entries) {
          const revenue = Number(e.booking.total_amount) || 0;
          // For team bookings, attribute proportional revenue based on pay share
          const bookingAssignments = teamAssignments.filter((a: any) => a.booking_id === e.booking.id);
          if (bookingAssignments.length > 1) {
            const totalTeamPay = bookingAssignments.reduce((sum: number, a: any) => {
              const member = staff.find((st) => st.id === a.staff_id);
              const ps = a.pay_share != null ? Number(a.pay_share) : null;
              const w = calcWage(e.booking, member, ps);
              return sum + w.calculatedPay;
            }, 0);
            const share = totalTeamPay > 0 ? e.pay / totalTeamPay : 1 / bookingAssignments.length;
            totalRevGenerated += revenue * share;
          } else {
            totalRevGenerated += revenue;
          }
          totalLaborCost += e.pay;
        }

        const profitGenerated = totalRevGenerated - totalLaborCost;
        const revenuePerHour = totalHours > 0 ? totalRevGenerated / totalHours : 0;
        const profitPerClean = cleans > 0 ? profitGenerated / cleans : 0;
        const profitMargin = totalRevGenerated > 0 ? (profitGenerated / totalRevGenerated) * 100 : 0;
        const costPerHour = totalHours > 0 ? totalLaborCost / totalHours : 0;

        return {
          id: s.id,
          name: s.name,
          cleans,
          totalHours,
          totalPay,
          totalRevGenerated,
          profitGenerated,
          revenuePerHour,
          profitPerClean,
          profitMargin,
          costPerHour,
        };
      })
      .filter((s) => s.cleans > 0)
      .sort((a, b) => b.revenuePerHour - a.revenuePerHour);
  }, [staff, bookings, teamAssignments]);


  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Tax Classification', 'Base Wage', 'Hours', 'Assigned Cleans', 'Period Pay', 'Avg Pay/Clean', 'YTD Earnings'];
    const rows = payrollData.map((s) => [
      s.name,
      s.email,
      s.tax_classification === 'w2' ? 'W-2 Employee' : '1099 Contractor',
      s.base_wage || s.hourly_rate || 0,
      s.totalHours,
      s.assignedCleans,
      s.totalPay,
      s.avgPayPerClean,
      s.ytdEarnings,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-report-${format(dateRange.from, 'yyyy-MM-dd')}-to-${format(dateRange.to, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDetailedCSV = () => {
    const headers = ['Date', 'Booking #', 'Staff', 'Customer', 'Hours', 'Wage Type', 'Rate', 'Payment'];
    const rows = filteredBookingPayrollDetails.map((b) => [
      format(new Date(b.scheduled_at), 'yyyy-MM-dd'),
      `#${b.booking_number}`,
      b.staff_name,
      b.customer_name,
      b.hours_worked.toFixed(2),
      b.wage_type,
      b.wage_type === 'percentage' ? `${b.wage_rate}%` : `$${b.wage_rate}`,
      b.calculated_pay.toFixed(2),
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-details-${format(dateRange.from, 'yyyy-MM-dd')}-to-${format(dateRange.to, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout
      title="Payroll Report"
      subtitle="Staff wages and 1099 tracking"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant={isFullyLocked ? 'destructive' : 'outline'}
            onClick={() => {
              setLockAction(isFullyLocked ? 'unlock' : 'lock');
              setShowLockConfirm(true);
            }}
            className="gap-2"
            disabled={totalLockableBookings === 0 || lockPeriodMutation.isPending}
          >
            {isFullyLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {isFullyLocked ? 'Unlock Period' : 'Lock Period'}
          </Button>
          <Button onClick={exportCSV} className="gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      }
    >
      <SubscriptionGate feature="Payroll">
      {/* Date Range Selector */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarIcon className="w-4 h-4" />
                {format(dateRange.from, 'MMM d, yyyy')} - {format(dateRange.to, 'MMM d, yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => {
                  if (range?.from) {
                    setDateRange({ from: range.from, to: range.to || range.from });
                  }
                }}
                numberOfMonths={2}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Payroll</p>
                <p className="text-2xl font-bold">{isTestMode ? '$X,XXX.XX' : `$${totalPayroll.toFixed(2)}`}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Hours</p>
                <p className="text-2xl font-bold">{isTestMode ? 'XX.X' : totalHours.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                 <Briefcase className="w-5 h-5 text-primary" />
               </div>
               <div>
                 <p className="text-sm text-muted-foreground">Assigned Cleans</p>
                <p className="text-2xl font-bold">{isTestMode ? 'XX' : totalCleans}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Calculator className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Pay/Clean</p>
                <p className="text-2xl font-bold">{isTestMode ? '$XX.XX' : `$${avgPayPerClean.toFixed(2)}`}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                contractorsNeedingFiling > 0 ? "bg-destructive/10" : "bg-muted"
              )}>
                <AlertTriangle className={cn(
                  "w-5 h-5",
                  contractorsNeedingFiling > 0 ? "text-destructive" : "text-muted-foreground"
                )} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">1099 Filing Required</p>
                <p className="text-2xl font-bold">{isTestMode ? 'X' : contractorsNeedingFiling}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Intelligence Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-chart-1/10">
                <BarChart3 className="w-5 h-5 text-chart-1" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net Revenue</p>
                <p className="text-xl font-bold">{isTestMode ? '$X,XXX' : `$${totalRevenue.toFixed(2)}`}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", totalProfit >= 0 ? "bg-chart-2/10" : "bg-destructive/10")}>
                {totalProfit >= 0 ? <TrendingUp className="w-5 h-5 text-chart-2" /> : <TrendingDown className="w-5 h-5 text-destructive" />}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Profit</p>
                <p className={cn("text-xl font-bold", totalProfit >= 0 ? "text-chart-2" : "text-destructive")}>
                  {isTestMode ? '$X,XXX' : `$${totalProfit.toFixed(2)}`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", isLowMargin ? "bg-destructive/10" : "bg-chart-3/10")}>
                <Percent className={cn("w-5 h-5", isLowMargin ? "text-destructive" : "text-chart-3")} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Profit Margin</p>
                <p className={cn("text-xl font-bold", isLowMargin ? "text-destructive" : "text-chart-3")}>
                  {isTestMode ? 'XX%' : `${profitMarginPct.toFixed(1)}%`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", laborCostPct > 70 ? "bg-destructive/10" : "bg-chart-4/10")}>
                <DollarSign className={cn("w-5 h-5", laborCostPct > 70 ? "text-destructive" : "text-chart-4")} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Labor Cost %</p>
                <p className={cn("text-xl font-bold", laborCostPct > 70 ? "text-destructive" : "text-chart-4")}>
                  {isTestMode ? 'XX%' : `${laborCostPct.toFixed(1)}%`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Margin Warning Banner */}
      {isLowMargin && (
        <Card className="mb-6 border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <TrendingDown className="w-5 h-5 text-destructive mt-0.5" />
              <div>
                <h3 className="font-semibold text-destructive">Low Profit Margin Warning</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your profit margin is {profitMarginPct.toFixed(1)}% — below the recommended 30% threshold. Review labor costs or adjust pricing.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 1099 Alert Banner */}
      {contractorsNeedingFiling > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800 dark:text-amber-400">1099 Tax Filing Required</h3>
                <p className="text-sm text-amber-700 dark:text-amber-500 mt-1">
                  {contractorsNeedingFiling} contractor(s) have earned $600 or more this year and require 1099-NEC filing.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Missing Pay Alert Banner */}
      {totalMissingPay > 0 && (
        <Card className="mb-6 border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-destructive">Missing Pay Data</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {totalMissingPay} booking(s) have assigned staff but no pay rate set.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => { setShowMissingPayOnly(true); setStaffFilterId('all'); setActivePayrollTab('details'); }}
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                View
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pay Lock Status Banner */}
      {(isFullyLocked || isPartiallyLocked) && (
        <Card className={cn("mb-6", isFullyLocked ? "border-primary/50 bg-primary/5" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Shield className={cn("w-5 h-5", isFullyLocked ? "text-primary" : "text-amber-600")} />
              <div className="flex-1">
                <h3 className={cn("font-semibold", isFullyLocked ? "text-primary" : "text-amber-700 dark:text-amber-400")}>
                  {isFullyLocked ? '🔒 Payroll Period Locked' : '⚠️ Partially Locked Period'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {isFullyLocked
                    ? `All ${lockedBookingIds.length} booking(s) in this period are frozen. Pay data cannot be modified.`
                    : `${lockedBookingIds.length} of ${totalLockableBookings} booking(s) are locked.`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for Summary and Details */}
      <Tabs value={activePayrollTab} onValueChange={setActivePayrollTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="summary">Staff Summary</TabsTrigger>
          <TabsTrigger value="details">Booking Details</TabsTrigger>
          <TabsTrigger value="profitability">Job Profitability</TabsTrigger>
          <TabsTrigger value="efficiency" className="gap-1">
            <Trophy className="w-3.5 h-3.5" />
            Staff Rankings
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1">
            <History className="w-3.5 h-3.5" />
            Audit Trail
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Staff Payroll Summary</CardTitle>
              <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
                <Download className="w-4 h-4" />
                Export Summary
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Tax Status</TableHead>
                    <TableHead>Base Wage</TableHead>
                    <TableHead className="text-right">Cleans</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Period Pay</TableHead>
                    <TableHead className="text-right">Avg/Clean</TableHead>
                    <TableHead className="text-right">YTD</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollData.map((staff) => (
                    <TableRow key={staff.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{maskName(staff.name)}</p>
                          <p className="text-xs text-muted-foreground">{maskEmail(staff.email)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={staff.tax_classification === 'w2' ? 'default' : 'secondary'}>
                          {staff.tax_classification === 'w2' ? 'W-2' : '1099'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isTestMode ? '$XX.XX/hr' : `$${(staff.base_wage || staff.hourly_rate || 0).toFixed(2)}/hr`}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isTestMode ? 'X' : staff.assignedCleans}
                          {staff.missingPayCount > 0 && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0 ml-1">
                              {staff.missingPayCount} missing
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{isTestMode ? 'X.X' : staff.totalHours}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {isTestMode ? '$XXX.XX' : `$${staff.totalPay.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {isTestMode ? '$XX.XX' : `$${staff.avgPayPerClean.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {isTestMode ? '$X,XXX.XX' : `$${staff.ytdEarnings.toFixed(2)}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {staff.requiresTaxFiling && (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              1099 Required
                            </Badge>
                          )}
                          {staff.totalPay > 0 && (
                            paidStaffIds.has(staff.id) ? (
                              <Badge 
                                variant="outline" 
                                className="border-green-500 bg-green-50 text-green-700 cursor-pointer hover:bg-green-100"
                                onClick={() => handleMarkPaid(staff.id, staff.name, staff.totalPay)}
                              >
                                <Check className="w-3 h-3 mr-1" />
                                Paid
                              </Badge>
                            ) : (
                              <Badge 
                                variant="outline" 
                                className="border-muted-foreground text-muted-foreground cursor-pointer hover:bg-muted"
                                onClick={() => handleMarkPaid(staff.id, staff.name, staff.totalPay)}
                              >
                                Mark Paid
                              </Badge>
                            )
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {payrollData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No staff members found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Booking Payroll Details</CardTitle>
              <Button variant="outline" size="sm" onClick={exportDetailedCSV} className="gap-2">
                <Download className="w-4 h-4" />
                Export Details
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2 pb-3">
                <Select value={staffFilterId} onValueChange={setStaffFilterId}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Filter by cleaner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All cleaners</SelectItem>
                    {staff.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant={showMissingPayOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowMissingPayOnly(!showMissingPayOnly)}
                  className="gap-1"
                >
                  <AlertCircle className="w-3 h-3" />
                  Missing Pay {totalMissingPay > 0 && `(${totalMissingPay})`}
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Booking #</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead>Wage Type</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookingPayrollDetails.map((b) => {
                    const bookingId = b.id.includes('-') ? b.id.split('-')[0] : b.id;
                    const isLocked = lockedBookingIds.includes(bookingId);
                    return (
                    <TableRow key={b.id} className={cn(b.missingPay ? 'bg-destructive/5' : '', isLocked ? 'opacity-75' : '')}>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {isLocked && <Lock className="w-3 h-3 text-muted-foreground" />}
                          {format(new Date(b.scheduled_at), 'MMM d, yyyy')}
                        </div>
                      </TableCell>
                      <TableCell>#{b.booking_number}</TableCell>
                      <TableCell className="font-medium">{maskName(b.staff_name)}</TableCell>
                      <TableCell>{maskName(b.customer_name)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {b.missingHours && (
                            <span className="inline-block" aria-label="Hours estimated from duration"><AlertCircle className="w-3 h-3 text-amber-500" /></span>
                          )}
                          {isTestMode ? 'X.XX' : b.hours_worked.toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {b.wage_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isTestMode ? '$XX.XX' : (b.wage_type === 'percentage' ? `${b.wage_rate}%` : `$${b.wage_rate.toFixed(2)}`)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {b.missingPay ? (
                          <Badge variant="destructive" className="text-xs">
                            Missing Pay
                          </Badge>
                        ) : (
                          <span className="text-green-600">
                            {isTestMode ? '$XXX.XX' : `$${b.calculated_pay.toFixed(2)}`}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                  })}
                  {filteredBookingPayrollDetails.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {showMissingPayOnly ? 'No bookings with missing pay 🎉' : 'No bookings with assigned staff for this period'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profitability">
          <Card>
            <CardHeader>
              <CardTitle>Job Profitability Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Booking #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Labor Cost</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookingProfitability.map((b) => (
                    <TableRow key={b.id} className={b.margin < 0 ? 'bg-destructive/5' : b.margin < 30 ? 'bg-amber-50 dark:bg-amber-950/10' : ''}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(b.scheduled_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>#{b.booking_number}</TableCell>
                      <TableCell>{maskName(b.customer_name)}</TableCell>
                      <TableCell className="text-right">
                        {isTestMode ? '$XXX' : `$${b.revenue.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {isTestMode ? '$XXX' : `$${b.laborCost.toFixed(2)}`}
                      </TableCell>
                      <TableCell className={cn("text-right font-medium", b.profit >= 0 ? "text-chart-2" : "text-destructive")}>
                        {isTestMode ? '$XXX' : `$${b.profit.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={b.margin < 0 ? 'destructive' : b.margin < 30 ? 'secondary' : 'default'}>
                          {isTestMode ? 'XX%' : `${b.margin.toFixed(0)}%`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {bookingProfitability.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No bookings with assigned staff for this period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="efficiency">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5" />
                Staff Efficiency Rankings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead className="text-right">Cleans</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Revenue Generated</TableHead>
                    <TableHead className="text-right">Rev/Hour</TableHead>
                    <TableHead className="text-right">Profit/Clean</TableHead>
                    <TableHead className="text-right">Cost/Hour</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffEfficiency.map((s, idx) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        {idx === 0 ? (
                          <span className="flex items-center gap-1 text-amber-500 font-bold">
                            <Star className="w-4 h-4 fill-amber-500" /> 1
                          </span>
                        ) : idx === 1 ? (
                          <span className="flex items-center gap-1 text-muted-foreground font-bold">
                            <Star className="w-4 h-4 fill-muted-foreground" /> 2
                          </span>
                        ) : idx === 2 ? (
                          <span className="flex items-center gap-1 text-orange-400 font-bold">
                            <Star className="w-4 h-4 fill-orange-400" /> 3
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{idx + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{maskName(s.name)}</TableCell>
                      <TableCell className="text-right">{isTestMode ? 'X' : s.cleans}</TableCell>
                      <TableCell className="text-right">{isTestMode ? 'X.X' : s.totalHours.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{isTestMode ? '$X,XXX' : `$${s.totalRevGenerated.toFixed(2)}`}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        {isTestMode ? '$XX' : `$${s.revenuePerHour.toFixed(2)}`}
                      </TableCell>
                      <TableCell className={cn("text-right font-semibold", s.profitPerClean >= 0 ? "text-chart-2" : "text-destructive")}>
                        {isTestMode ? '$XX' : `$${s.profitPerClean.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {isTestMode ? '$XX' : `$${s.costPerHour.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={s.profitMargin < 0 ? 'destructive' : s.profitMargin < 30 ? 'secondary' : 'default'}>
                          {isTestMode ? 'XX%' : `${s.profitMargin.toFixed(0)}%`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {staffEfficiency.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No staff with bookings in this period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Payroll Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Bookings</TableHead>
                    <TableHead className="text-right">Payroll</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.map((entry: any) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.action === 'period_locked' ? 'default' : 'secondary'} className="gap-1">
                          {entry.action === 'period_locked' ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                          {entry.action === 'period_locked' ? 'Locked' : 'Unlocked'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(entry.period_start), 'MMM d')} - {format(new Date(entry.period_end), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {entry.details?.booking_count || '-'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {isTestMode ? '$X,XXX' : entry.details?.total_payroll != null ? `$${Number(entry.details.total_payroll).toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {isTestMode ? '$X,XXX' : entry.details?.total_revenue != null ? `$${Number(entry.details.total_revenue).toFixed(2)}` : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {auditLog.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No audit entries yet. Lock a payroll period to create the first entry.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Lock/Unlock Confirmation Dialog */}
      <AlertDialog open={showLockConfirm} onOpenChange={setShowLockConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {lockAction === 'lock' ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
              {lockAction === 'lock' ? 'Lock Payroll Period?' : 'Unlock Payroll Period?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lockAction === 'lock'
                ? `This will freeze pay data for ${totalLockableBookings} booking(s) from ${format(dateRange.from, 'MMM d')} to ${format(dateRange.to, 'MMM d, yyyy')}. No pay changes can be made until unlocked.`
                : `This will make pay data editable again for ${lockedBookingIds.length} booking(s). This action will be logged.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => lockPeriodMutation.mutate(lockAction)}
              className={lockAction === 'unlock' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {lockAction === 'lock' ? '🔒 Lock Period' : '🔓 Unlock Period'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      </SubscriptionGate>
    </AdminLayout>
  );
}
