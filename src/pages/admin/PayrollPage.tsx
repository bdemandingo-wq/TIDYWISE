import { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { SubscriptionGate } from '@/components/admin/SubscriptionGate';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { format, startOfMonth, endOfMonth, startOfYear, startOfWeek, addDays } from 'date-fns';
import { CalendarIcon, Download, AlertTriangle, DollarSign, Clock, Calculator, Briefcase, Check, TrendingUp, TrendingDown, Percent, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrgId } from '@/hooks/useOrgId';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { calculateBookingWage } from '@/lib/wageCalculation';
import { usePayrollPeriodConfig } from '@/hooks/usePayrollPeriodConfig';
import { getCurrentPeriod, getNextPeriod, getPeriodTitle, formatPeriodLabel } from '@/lib/payrollPeriod';
import { PayrollPeriodSettings } from '@/components/admin/PayrollPeriodSettings';

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
  revenueAttributed: number;
  profitAttributed: number;
  laborPercent: number;
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
  revenue_net: number;
  labor_cost: number;
  labor_percent: number;
  profit: number;
  margin_percent: number;
  isMissingPay: boolean;
}

interface PayrollSettings {
  processing_fee_mode: string;
  processing_fee_percent: number;
  vendor_cost_mode: string;
  vendor_cost_flat: number;
  vendor_cost_percent: number;
  labor_percent_warning_threshold: number;
  margin_percent_good_threshold: number;
}

const DEFAULT_SETTINGS: PayrollSettings = {
  processing_fee_mode: 'percent',
  processing_fee_percent: 2.9,
  vendor_cost_mode: 'none',
  vendor_cost_flat: 0,
  vendor_cost_percent: 0,
  labor_percent_warning_threshold: 60,
  margin_percent_good_threshold: 30,
};

// Financial calculation helpers
function calcProcessingFee(revenueGross: number, settings: PayrollSettings): number {
  if (settings.processing_fee_mode === 'percent') {
    return revenueGross * (settings.processing_fee_percent / 100);
  }
  return 0;
}

function calcVendorCost(revenueNet: number, settings: PayrollSettings): number {
  if (settings.vendor_cost_mode === 'flat') return settings.vendor_cost_flat;
  if (settings.vendor_cost_mode === 'percent') return revenueNet * (settings.vendor_cost_percent / 100);
  return 0;
}

function calcBookingFinancials(booking: any, laborCost: number, settings: PayrollSettings) {
  const revenueGross = Number(booking.total_amount) || 0;
  const discountAmount = Number(booking.discount_amount) || 0;
  const subtotal = Number(booking.subtotal) || revenueGross;
  const revenueNet = subtotal - discountAmount;
  const processingFee = calcProcessingFee(revenueGross, settings);
  const vendorCost = calcVendorCost(revenueNet, settings);
  const profit = revenueNet - laborCost - vendorCost - processingFee;
  const laborPercent = revenueNet > 0 ? (laborCost / revenueNet) * 100 : 0;
  const marginPercent = revenueNet > 0 ? (profit / revenueNet) * 100 : 0;
  return { revenueNet, revenueGross, processingFee, vendorCost, profit, laborPercent, marginPercent };
}

export default function PayrollPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [staffFilterId, setStaffFilterId] = useState<string>('all');
  const [profitFilter, setProfitFilter] = useState<string>('all');
  const { isTestMode, maskName, maskEmail } = useTestMode();
  const { organizationId } = useOrgId();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const weekStart = format(startOfWeek(dateRange.from, { weekStartsOn: 1 }), 'yyyy-MM-dd');

  // Fetch payroll settings
  const { data: payrollSettings } = useQuery({
    queryKey: ['payroll-settings', organizationId],
    queryFn: async () => {
      if (!organizationId) return DEFAULT_SETTINGS;
      const { data, error } = await supabase
        .from('payroll_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_SETTINGS;
      return {
        processing_fee_mode: data.processing_fee_mode,
        processing_fee_percent: Number(data.processing_fee_percent),
        vendor_cost_mode: data.vendor_cost_mode,
        vendor_cost_flat: Number(data.vendor_cost_flat),
        vendor_cost_percent: Number(data.vendor_cost_percent),
        labor_percent_warning_threshold: Number(data.labor_percent_warning_threshold),
        margin_percent_good_threshold: Number(data.margin_percent_good_threshold),
      } as PayrollSettings;
    },
    enabled: !!organizationId,
  });

  const settings = payrollSettings || DEFAULT_SETTINGS;

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
        const { error } = await supabase
          .from('payroll_payments')
          .delete()
          .eq('organization_id', organizationId)
          .eq('staff_id', staffId)
          .eq('week_start', weekStart);
        if (error) throw error;
        return { staffName, isPaid: false };
      } else {
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
      toast[data.isPaid ? 'success' : 'info'](`${data.staffName} marked as ${data.isPaid ? 'paid' : 'unpaid'}`);
    },
    onError: () => toast.error('Failed to update payment status'),
  });

  const handleMarkPaid = (staffId: string, staffName: string, amount?: number) => {
    markPaidMutation.mutate({ staffId, staffName, isPaid: paidStaffIds.has(staffId), amount });
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

  // Fetch bookings for selected date range
  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings-payroll', dateRange, organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const toEndOfDay = new Date(dateRange.to);
      toEndOfDay.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from('bookings')
        .select(`*, customer:customers(*), staff:staff(*)`)
        .eq('organization_id', organizationId)
        .gte('scheduled_at', dateRange.from.toISOString())
        .lte('scheduled_at', toEndOfDay.toISOString())
        .order('scheduled_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch team assignments
  const { data: teamAssignments = [] } = useQuery({
    queryKey: ['team-assignments-payroll', dateRange, organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const toEndOfDay = new Date(dateRange.to);
      toEndOfDay.setHours(23, 59, 59, 999);
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

  // Payroll period config
  const { config: periodConfig } = usePayrollPeriodConfig();
  const currentPeriod = useMemo(() => getCurrentPeriod(periodConfig), [periodConfig]);
  const nextPeriod = useMemo(() => getNextPeriod(periodConfig), [periodConfig]);

  const currentWeekStart = currentPeriod.start;
  const currentWeekEnd = currentPeriod.end;
  const nextWeekStart = nextPeriod.start;
  const nextWeekEnd = nextPeriod.end;

  const { data: forecastBookings = [] } = useQuery({
    queryKey: ['forecast-bookings', organizationId, currentWeekStart.toISOString(), nextWeekEnd.toISOString()],
    queryFn: async () => {
      if (!organizationId) return [];
      const nwEnd = new Date(nextWeekEnd);
      nwEnd.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from('bookings')
        .select(`*, customer:customers(*), staff:staff(*)`)
        .eq('organization_id', organizationId)
        .neq('status', 'cancelled')
        .gte('scheduled_at', currentWeekStart.toISOString())
        .lte('scheduled_at', nwEnd.toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  const { data: forecastTeamAssignments = [] } = useQuery({
    queryKey: ['forecast-team-assignments', organizationId],
    queryFn: async () => {
      if (!organizationId || !forecastBookings.length) return [];
      const ids = forecastBookings.map((b: any) => b.id);
      const { data, error } = await supabase
        .from('booking_team_assignments')
        .select('*')
        .eq('organization_id', organizationId)
        .in('booking_id', ids);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && forecastBookings.length > 0,
  });

  // Fetch YTD bookings for 1099
  const { data: ytdBookings = [] } = useQuery({
    queryKey: ['bookings-ytd', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'completed')
        .gte('scheduled_at', startOfYear(new Date()).toISOString());
      if (error) throw error;
      return data;
    },
  });

  const { data: ytdTeamAssignments = [] } = useQuery({
    queryKey: ['team-assignments-ytd', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data: bookingIds } = await supabase
        .from('bookings')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('status', 'completed')
        .gte('scheduled_at', startOfYear(new Date()).toISOString());
      if (!bookingIds?.length) return [];
      const { data, error } = await supabase
        .from('booking_team_assignments')
        .select('*')
        .eq('organization_id', organizationId)
        .in('booking_id', bookingIds.map((b: any) => b.id));
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  // Wage calculation — pay_share (per-cleaner) takes priority over cleaner_pay_expected (booking total)
  const calcWage = (booking: any, staffMember: any, payShareOverride?: number | null) => {
    const baseResult = calculateBookingWage(booking, staffMember);
    // PRIORITY 1: Individual cleaner pay from team assignments (pay_share)
    if (payShareOverride != null && Number(payShareOverride) > 0) {
      return { calculatedPay: Number(payShareOverride), actualPay: Number(payShareOverride), wageType: 'actual', wageRate: Number(payShareOverride), hoursWorked: baseResult.hoursWorked, isMissingPay: false };
    }
    // PRIORITY 2: cleaner_pay_expected is the booking-level source of truth (single-staff bookings)
    if (booking.cleaner_pay_expected != null) {
      return { calculatedPay: Number(booking.cleaner_pay_expected), actualPay: Number(booking.cleaner_pay_expected), wageType: baseResult.wageType, wageRate: baseResult.wageRate, hoursWorked: baseResult.hoursWorked, isMissingPay: false };
    }
    // PRIORITY 3: Fallback calculation from rate/hours
    return { calculatedPay: baseResult.calculatedPay, actualPay: null, wageType: baseResult.wageType, wageRate: baseResult.wageRate, hoursWorked: baseResult.hoursWorked, isMissingPay: baseResult.isMissingPay };
  };

  const getStaffPayEntries = (staffId: string, bookingList: any[], assignmentList: any[]) => {
    const entries: { booking: any; pay: number; hours: number }[] = [];
    const staffMember = staff.find((s) => s.id === staffId);
    const primaryBookings = bookingList.filter((b: any) => b.staff_id === staffId && b.status !== 'cancelled');
    for (const b of primaryBookings) {
      const assignment = assignmentList.find((a: any) => a.booking_id === b.id && a.staff_id === staffId);
      const payShareOverride = assignment?.pay_share != null ? Number(assignment.pay_share) : null;
      const wageInfo = calcWage(b, staffMember, payShareOverride);
      entries.push({ booking: b, pay: wageInfo.calculatedPay, hours: wageInfo.hoursWorked });
    }
    const teamEntries = assignmentList.filter((a: any) => a.staff_id === staffId && !primaryBookings.find((b: any) => b.id === a.booking_id));
    for (const a of teamEntries) {
      const booking = bookingList.find((b: any) => b.id === a.booking_id && b.status !== 'cancelled');
      if (!booking) continue;
      const payShareOverride = a.pay_share != null ? Number(a.pay_share) : null;
      const wageInfo = calcWage(booking, staffMember, payShareOverride);
      entries.push({ booking, pay: wageInfo.calculatedPay, hours: wageInfo.hoursWorked });
    }
    return entries;
  };

  // Booking payroll details with financial columns
  const bookingPayrollDetails: BookingPayrollDetail[] = useMemo(() => {
    const details: BookingPayrollDetail[] = [];
    const assignedBookings = bookings.filter((b: any) => b.status !== 'cancelled' && b.staff_id);

    for (const b of assignedBookings) {
      const staffMember = staff.find((s) => s.id === b.staff_id);
      const assignments = teamAssignments.filter((a: any) => a.booking_id === b.id);

      if (assignments.length > 0) {
        // Calculate total labor for this booking across all team members
        let totalBookingLabor = 0;
        const memberDetails: any[] = [];
        for (const a of assignments) {
          const member = staff.find((s) => s.id === a.staff_id);
          const payShareOverride = a.pay_share != null ? Number(a.pay_share) : null;
          const wageInfo = calcWage(b, member, payShareOverride);
          totalBookingLabor += wageInfo.calculatedPay;
          memberDetails.push({ a, member, wageInfo });
        }

        const financials = calcBookingFinancials(b, totalBookingLabor, settings);

        for (const { a, member, wageInfo } of memberDetails) {
          const memberLaborPct = financials.revenueNet > 0 ? (wageInfo.calculatedPay / financials.revenueNet) * 100 : 0;
          details.push({
            id: `${b.id}-${a.staff_id}`,
            booking_number: b.booking_number,
            customer_name: b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown',
            scheduled_at: b.scheduled_at,
            duration: b.duration,
            hours_worked: wageInfo.hoursWorked,
            wage_type: wageInfo.wageType,
            wage_rate: wageInfo.wageRate,
            calculated_pay: wageInfo.calculatedPay,
            actual_pay: wageInfo.actualPay,
            staff_id: a.staff_id,
            staff_name: member?.name || staffMember?.name || 'Unassigned',
            revenue_net: financials.revenueNet,
            labor_cost: wageInfo.calculatedPay,
            labor_percent: memberLaborPct,
            profit: financials.profit * (totalBookingLabor > 0 ? wageInfo.calculatedPay / totalBookingLabor : 1 / assignments.length),
            margin_percent: financials.marginPercent,
            isMissingPay: wageInfo.isMissingPay,
          });
        }
      } else {
        const wageInfo = calcWage(b, staffMember);
        const financials = calcBookingFinancials(b, wageInfo.calculatedPay, settings);
        details.push({
          id: b.id,
          booking_number: b.booking_number,
          customer_name: b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown',
          scheduled_at: b.scheduled_at,
          duration: b.duration,
          hours_worked: wageInfo.hoursWorked,
          wage_type: wageInfo.wageType,
          wage_rate: wageInfo.wageRate,
          calculated_pay: wageInfo.calculatedPay,
          actual_pay: wageInfo.actualPay,
          staff_id: b.staff_id,
          staff_name: staffMember?.name || 'Unassigned',
          revenue_net: financials.revenueNet,
          labor_cost: wageInfo.calculatedPay,
          labor_percent: financials.laborPercent,
          profit: financials.profit,
          margin_percent: financials.marginPercent,
          isMissingPay: wageInfo.isMissingPay,
        });
      }
    }
    return details;
  }, [bookings, staff, teamAssignments, settings]);

  // Apply filters
  const filteredBookingPayrollDetails = useMemo(() => {
    let filtered = bookingPayrollDetails;
    if (staffFilterId !== 'all') filtered = filtered.filter((d) => d.staff_id === staffFilterId);
    if (profitFilter === 'negative') filtered = filtered.filter((d) => d.profit < 0);
    if (profitFilter === 'high_labor') filtered = filtered.filter((d) => d.labor_percent > settings.labor_percent_warning_threshold);
    if (profitFilter === 'low_margin') filtered = filtered.filter((d) => d.margin_percent < settings.margin_percent_good_threshold && d.profit >= 0);
    if (profitFilter === 'missing_pay') filtered = filtered.filter((d) => d.isMissingPay || d.calculated_pay === 0);
    return filtered;
  }, [bookingPayrollDetails, staffFilterId, profitFilter, settings]);

  // Payroll data per staff with financial intelligence
  const payrollData: StaffWithPayroll[] = useMemo(() => {
    return staff.map((s) => {
      const entries = getStaffPayEntries(s.id, bookings, teamAssignments);
      const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
      const totalPay = entries.reduce((sum, e) => sum + e.pay, 0);

      // Revenue attributed to this cleaner
      const revenueAttributed = entries.reduce((sum, e) => {
        const rev = Number(e.booking.subtotal || e.booking.total_amount) - Number(e.booking.discount_amount || 0);
        return sum + rev;
      }, 0);
      const profitAttributed = revenueAttributed - totalPay;
      const laborPercent = revenueAttributed > 0 ? (totalPay / revenueAttributed) * 100 : 0;

      const ytdEntries = getStaffPayEntries(s.id, ytdBookings, ytdTeamAssignments);
      const ytdEarnings = ytdEntries.reduce((sum, e) => sum + e.pay, 0);

      const upcomingPrimary = bookings.filter((b: any) => b.staff_id === s.id && !['completed', 'cancelled', 'no_show'].includes(b.status)).length;
      const upcomingTeam = teamAssignments.filter((a: any) => {
        if (a.staff_id !== s.id) return false;
        const b = bookings.find((bk: any) => bk.id === a.booking_id);
        return b && !['completed', 'cancelled', 'no_show'].includes(b.status);
      }).length;

      const assignedCleans = entries.length;
      return {
        id: s.id, name: s.name, email: s.email,
        tax_classification: s.tax_classification,
        base_wage: s.base_wage, hourly_rate: s.hourly_rate,
        totalHours: Math.round(totalHours * 100) / 100,
        totalPay: Math.round(totalPay * 100) / 100,
        ytdEarnings: Math.round(ytdEarnings * 100) / 100,
        requiresTaxFiling: s.tax_classification === '1099' && ytdEarnings >= 600,
        upcomingBookings: upcomingPrimary + upcomingTeam,
        assignedCleans,
        avgPayPerClean: assignedCleans > 0 ? Math.round((totalPay / assignedCleans) * 100) / 100 : 0,
        revenueAttributed: Math.round(revenueAttributed * 100) / 100,
        profitAttributed: Math.round(profitAttributed * 100) / 100,
        laborPercent: Math.round(laborPercent * 10) / 10,
      };
    });
  }, [staff, bookings, ytdBookings, teamAssignments, ytdTeamAssignments]);

  // Summary stats
  const effectivePayrollData = staffFilterId === 'all' ? payrollData : payrollData.filter((s) => s.id === staffFilterId);
  const totalPayroll = effectivePayrollData.reduce((sum, s) => sum + s.totalPay, 0);
  const totalHours = effectivePayrollData.reduce((sum, s) => sum + s.totalHours, 0);
  const totalCleans = effectivePayrollData.reduce((sum, s) => sum + s.assignedCleans, 0);
  const totalRevenue = effectivePayrollData.reduce((sum, s) => sum + s.revenueAttributed, 0);
  const totalProfit = totalRevenue - totalPayroll;
  const avgLaborPct = totalRevenue > 0 ? (totalPayroll / totalRevenue) * 100 : 0;
  const contractorsNeedingFiling = payrollData.filter((s) => s.requiresTaxFiling).length;
  const avgPayPerClean = totalCleans > 0 ? totalPayroll / totalCleans : 0;
  const negativeMarginCount = bookingPayrollDetails.filter(d => d.profit < 0).length;
  const missingPayCount = bookingPayrollDetails.filter(d => d.isMissingPay || (d.calculated_pay === 0 && d.staff_id)).length;

  // Filtered totals
  const filteredTotalHours = filteredBookingPayrollDetails.reduce((sum, b) => sum + b.hours_worked, 0);
  const filteredTotalPay = filteredBookingPayrollDetails.reduce((sum, b) => sum + b.calculated_pay, 0);
  const filteredTotalRevenue = filteredBookingPayrollDetails.reduce((sum, b) => sum + b.revenue_net, 0);
  const filteredTotalProfit = filteredBookingPayrollDetails.reduce((sum, b) => sum + b.profit, 0);

  // Weekly forecast helper
  const calcWeekForecast = (weekBookings: any[], weekTeam: any[]) => {
    let revenueNet = 0;
    let laborTotal = 0;
    let bookingCount = 0;
    let missingPay = 0;
    const seen = new Set<string>();

    for (const b of weekBookings) {
      if (b.status === 'cancelled' || seen.has(b.id)) continue;
      seen.add(b.id);
      bookingCount++;
      const rev = Number(b.subtotal || b.total_amount) - Number(b.discount_amount || 0);
      revenueNet += rev;

      const assignments = weekTeam.filter((a: any) => a.booking_id === b.id);
      if (assignments.length > 0) {
        for (const a of assignments) {
          const member = staff.find((s) => s.id === a.staff_id);
          const ps = a.pay_share != null ? Number(a.pay_share) : null;
          const w = calcWage(b, member, ps);
          laborTotal += w.calculatedPay;
          if (w.calculatedPay === 0) missingPay++;
        }
      } else if (b.staff_id) {
        const sm = staff.find((s) => s.id === b.staff_id);
        const w = calcWage(b, sm);
        laborTotal += w.calculatedPay;
        if (w.calculatedPay === 0) missingPay++;
      }
    }

    const profit = revenueNet - laborTotal;
    const laborPct = revenueNet > 0 ? (laborTotal / revenueNet) * 100 : 0;
    return { revenueNet, laborTotal, profit, laborPct, bookingCount, missingPay };
  };

  const endOfDay = (d: Date) => { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; };
  const currentWeekBookings = forecastBookings.filter((b: any) =>
    new Date(b.scheduled_at) >= currentWeekStart && new Date(b.scheduled_at) <= endOfDay(currentWeekEnd)
  );
  const nextWeekBookings = forecastBookings.filter((b: any) =>
    new Date(b.scheduled_at) >= nextWeekStart && new Date(b.scheduled_at) <= endOfDay(nextWeekEnd)
  );

  const currentWeekForecast = useMemo(() => calcWeekForecast(currentWeekBookings, forecastTeamAssignments), [currentWeekBookings, forecastTeamAssignments, staff]);
  const nextWeekForecast = useMemo(() => calcWeekForecast(nextWeekBookings, forecastTeamAssignments), [nextWeekBookings, forecastTeamAssignments, staff]);

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Tax Classification', 'Base Wage', 'Hours', 'Assigned Cleans', 'Period Pay', 'Revenue', 'Profit', 'Labor %', 'Avg Pay/Clean', 'YTD Earnings'];
    const rows = payrollData.map((s) => [
      s.name, s.email,
      s.tax_classification === 'w2' ? 'W-2 Employee' : '1099 Contractor',
      s.base_wage || s.hourly_rate || 0,
      s.totalHours, s.assignedCleans, s.totalPay,
      s.revenueAttributed, s.profitAttributed, `${s.laborPercent}%`,
      s.avgPayPerClean, s.ytdEarnings,
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
    const headers = ['Date', 'Booking #', 'Staff', 'Customer', 'Hours', 'Wage Type', 'Rate', 'Payment', 'Revenue (Net)', 'Labor %', 'Profit', 'Margin %'];
    const rows = filteredBookingPayrollDetails.map((b) => [
      format(new Date(b.scheduled_at), 'yyyy-MM-dd'),
      `#${b.booking_number}`, b.staff_name, b.customer_name,
      b.hours_worked.toFixed(2), b.wage_type,
      b.wage_type === 'percentage' ? `${b.wage_rate}%` : `$${b.wage_rate}`,
      b.calculated_pay.toFixed(2), b.revenue_net.toFixed(2),
      `${b.labor_percent.toFixed(1)}%`, b.profit.toFixed(2), `${b.margin_percent.toFixed(1)}%`,
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

  const getRowHighlight = (detail: BookingPayrollDetail) => {
    if (detail.profit < 0) return 'bg-red-50 dark:bg-red-950/20';
    if (detail.labor_percent > settings.labor_percent_warning_threshold) return 'bg-amber-50 dark:bg-amber-950/20';
    if (detail.margin_percent > settings.margin_percent_good_threshold) return 'bg-green-50 dark:bg-green-950/10';
    return '';
  };

  const ForecastCard = ({ title, forecast, weekLabel }: { title: string; forecast: ReturnType<typeof calcWeekForecast>; weekLabel: string }) => (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-base">{weekLabel}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground">Revenue (Net)</p>
            <p className="font-semibold">{isTestMode ? '$X,XXX' : `$${forecast.revenueNet.toFixed(2)}`}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Payroll</p>
            <p className="font-semibold">{isTestMode ? '$X,XXX' : `$${forecast.laborTotal.toFixed(2)}`}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Profit</p>
            <p className={cn("font-semibold", forecast.profit < 0 ? "text-destructive" : "text-green-600")}>
              {isTestMode ? '$XXX' : `$${forecast.profit.toFixed(2)}`}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Labor %</p>
            <p className={cn("font-semibold", forecast.laborPct > settings.labor_percent_warning_threshold ? "text-amber-600" : "")}>
              {isTestMode ? 'XX%' : `${forecast.laborPct.toFixed(1)}%`}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Bookings</p>
            <p className="font-semibold">{isTestMode ? 'X' : forecast.bookingCount}</p>
          </div>
          {forecast.missingPay > 0 && (
            <div>
              <p className="text-muted-foreground">Missing Pay</p>
              <p className="font-semibold text-destructive">{forecast.missingPay}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <AdminLayout
      title="Payroll Report"
      subtitle="Staff wages, profitability, and forecasting"
      actions={
        <Button onClick={exportCSV} className="gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      }
    >
      <SubscriptionGate feature="Payroll">
      {/* Date Range Selector */}
      <div className="flex items-center gap-4 mb-6">
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
                if (range?.from) setDateRange({ from: range.from, to: range.to || range.from });
              }}
              numberOfMonths={2}
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Payroll</p>
                <p className="text-xl font-bold">{isTestMode ? '$X,XXX' : `$${totalPayroll.toFixed(2)}`}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <TrendingUp className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Revenue (Net)</p>
                <p className="text-xl font-bold">{isTestMode ? '$X,XXX' : `$${totalRevenue.toFixed(2)}`}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", totalProfit >= 0 ? "bg-green-500/10" : "bg-destructive/10")}>
                {totalProfit >= 0 ? <TrendingUp className="w-5 h-5 text-green-500" /> : <TrendingDown className="w-5 h-5 text-destructive" />}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Profit</p>
                <p className={cn("text-xl font-bold", totalProfit < 0 ? "text-destructive" : "text-green-600")}>
                  {isTestMode ? '$XXX' : `$${totalProfit.toFixed(2)}`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", avgLaborPct > settings.labor_percent_warning_threshold ? "bg-amber-500/10" : "bg-muted")}>
                <Percent className={cn("w-5 h-5", avgLaborPct > settings.labor_percent_warning_threshold ? "text-amber-500" : "text-muted-foreground")} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg Labor %</p>
                <p className="text-xl font-bold">{isTestMode ? 'XX%' : `${avgLaborPct.toFixed(1)}%`}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Briefcase className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Assigned Cleans</p>
                <p className="text-xl font-bold">{isTestMode ? 'XX' : totalCleans}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Hours</p>
                <p className="text-xl font-bold">{isTestMode ? 'XX.X' : totalHours.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", contractorsNeedingFiling > 0 ? "bg-amber-500/10" : "bg-muted")}>
                <AlertTriangle className={cn("w-5 h-5", contractorsNeedingFiling > 0 ? "text-amber-500" : "text-muted-foreground")} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">1099 Filing</p>
                <p className="text-xl font-bold">{isTestMode ? 'X' : contractorsNeedingFiling}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert Banners */}
      {negativeMarginCount > 0 && (
        <Card className="mb-4 border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <TrendingDown className="w-5 h-5 text-destructive mt-0.5" />
              <div>
                <h3 className="font-semibold text-destructive">Negative Margin Alert</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {negativeMarginCount} booking(s) have negative profit — labor cost exceeds revenue.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {missingPayCount > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800 dark:text-amber-400">Missing Pay Data</h3>
                <p className="text-sm text-amber-700 dark:text-amber-500 mt-1">
                  {missingPayCount} booking(s) have $0 cleaner pay configured.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Period Forecast */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <ForecastCard
          title={getPeriodTitle(periodConfig, 'current')}
          forecast={currentWeekForecast}
          weekLabel={formatPeriodLabel(currentWeekStart, currentWeekEnd)}
        />
        <ForecastCard
          title={getPeriodTitle(periodConfig, 'next')}
          forecast={nextWeekForecast}
          weekLabel={formatPeriodLabel(nextWeekStart, nextWeekEnd)}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList>
          <TabsTrigger value="summary">Staff Summary</TabsTrigger>
          <TabsTrigger value="details">Booking Details</TabsTrigger>
          <TabsTrigger value="settings">Payroll Settings</TabsTrigger>
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
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Tax Status</TableHead>
                    <TableHead className="text-right">Cleans</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Period Pay</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Labor %</TableHead>
                    <TableHead className="text-right">YTD</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollData.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{maskName(s.name)}</p>
                          <p className="text-xs text-muted-foreground">{maskEmail(s.email)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.tax_classification === 'w2' ? 'default' : 'secondary'}>
                          {s.tax_classification === 'w2' ? 'W-2' : '1099'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{isTestMode ? 'X' : s.assignedCleans}</TableCell>
                      <TableCell className="text-right">{isTestMode ? 'X.X' : s.totalHours}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {isTestMode ? '$XXX' : `$${s.totalPay.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {isTestMode ? '$XXX' : `$${s.revenueAttributed.toFixed(2)}`}
                      </TableCell>
                      <TableCell className={cn("text-right font-medium", s.profitAttributed < 0 ? "text-destructive" : "text-green-600")}>
                        {isTestMode ? '$XXX' : `$${s.profitAttributed.toFixed(2)}`}
                      </TableCell>
                      <TableCell className={cn("text-right", s.laborPercent > settings.labor_percent_warning_threshold ? "text-amber-600 font-medium" : "")}>
                        {isTestMode ? 'XX%' : `${s.laborPercent.toFixed(1)}%`}
                      </TableCell>
                      <TableCell className="text-right">
                        {isTestMode ? '$X,XXX' : `$${s.ytdEarnings.toFixed(2)}`}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {s.requiresTaxFiling && (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">
                              <AlertTriangle className="w-3 h-3 mr-1" />1099
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {payrollData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        No staff members found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
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
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={profitFilter} onValueChange={setProfitFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by profitability" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All bookings</SelectItem>
                    <SelectItem value="negative">🔴 Negative profit</SelectItem>
                    <SelectItem value="high_labor">🟡 High labor %</SelectItem>
                    <SelectItem value="low_margin">Low margin</SelectItem>
                    <SelectItem value="missing_pay">Missing pay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Booking #</TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Payment</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Labor %</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookingPayrollDetails.map((b) => (
                    <TableRow key={b.id} className={getRowHighlight(b)}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(b.scheduled_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>#{b.booking_number}</TableCell>
                      <TableCell className="font-medium">{maskName(b.staff_name)}</TableCell>
                      <TableCell>{maskName(b.customer_name)}</TableCell>
                      <TableCell className="text-right">{isTestMode ? 'X.XX' : b.hours_worked.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        <div className="flex items-center justify-end gap-1.5">
                          {isTestMode ? '$XXX' : `$${b.calculated_pay.toFixed(2)}`}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {isTestMode ? '$XXX' : `$${b.revenue_net.toFixed(2)}`}
                      </TableCell>
                      <TableCell className={cn("text-right", b.labor_percent > settings.labor_percent_warning_threshold ? "text-amber-600 font-medium" : "")}>
                        {isTestMode ? 'XX%' : `${b.labor_percent.toFixed(1)}%`}
                      </TableCell>
                      <TableCell className={cn("text-right font-medium", b.profit < 0 ? "text-destructive" : "text-green-600")}>
                        {isTestMode ? '$XXX' : `$${b.profit.toFixed(2)}`}
                      </TableCell>
                      <TableCell className={cn("text-right", b.margin_percent < 0 ? "text-destructive" : b.margin_percent > settings.margin_percent_good_threshold ? "text-green-600" : "")}>
                        {isTestMode ? 'XX%' : `${b.margin_percent.toFixed(1)}%`}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredBookingPayrollDetails.length > 0 && (
                    <TableRow className="bg-muted/50 font-semibold border-t-2">
                      <TableCell colSpan={4} className="text-right">
                        Totals ({filteredBookingPayrollDetails.length} booking{filteredBookingPayrollDetails.length !== 1 ? 's' : ''})
                      </TableCell>
                      <TableCell className="text-right">{isTestMode ? 'X.XX' : filteredTotalHours.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-green-600">
                        {isTestMode ? '$XXX' : `$${filteredTotalPay.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {isTestMode ? '$XXX' : `$${filteredTotalRevenue.toFixed(2)}`}
                      </TableCell>
                      <TableCell className={cn("text-right", filteredTotalRevenue > 0 && (filteredTotalPay / filteredTotalRevenue) * 100 > settings.labor_percent_warning_threshold ? "text-amber-600" : "")}>
                        {isTestMode ? 'XX%' : filteredTotalRevenue > 0 ? `${((filteredTotalPay / filteredTotalRevenue) * 100).toFixed(1)}%` : '—'}
                      </TableCell>
                      <TableCell className={cn("text-right", filteredTotalProfit < 0 ? "text-destructive" : "text-green-600")}>
                        {isTestMode ? '$XXX' : `$${filteredTotalProfit.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {isTestMode ? 'XX%' : filteredTotalRevenue > 0 ? `${((filteredTotalProfit / filteredTotalRevenue) * 100).toFixed(1)}%` : '—'}
                      </TableCell>
                    </TableRow>
                  )}
                  {bookingPayrollDetails.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        No bookings with assigned staff for this period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <PayrollPeriodSettings />
        </TabsContent>
      </Tabs>
      </SubscriptionGate>
    </AdminLayout>
  );
}
