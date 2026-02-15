import { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { CalendarIcon, Download, AlertTriangle, DollarSign, Clock, Calculator, Briefcase, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrgId } from '@/hooks/useOrgId';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { calculateBookingWage } from '@/lib/wageCalculation';
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
  completedCleans: number;
  avgPayPerClean: number;
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
  staff_name: string;
}

export default function PayrollPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const { isTestMode, maskName, maskEmail } = useTestMode();
  const { organizationId } = useOrgId();
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers(*),
          staff:staff(*)
        `)
        .eq('organization_id', organizationId)
        .gte('scheduled_at', dateRange.from.toISOString())
        .lte('scheduled_at', dateRange.to.toISOString())
        .order('scheduled_at', { ascending: false });
      if (error) throw error;
      return data;
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

  // Wage calculation uses shared utility from lib/wageCalculation.ts
  // to ensure portal and payroll always match.
  const calcWage = (booking: any, staffMember: any) => {
    const result = calculateBookingWage(booking, staffMember);
    return {
      calculatedPay: result.calculatedPay,
      actualPay: booking.cleaner_actual_payment ? Number(booking.cleaner_actual_payment) : null,
      wageType: result.wageType,
      wageRate: result.wageRate,
      hoursWorked: result.hoursWorked,
    };
  };

  // Detailed booking payroll breakdown
  const bookingPayrollDetails: BookingPayrollDetail[] = useMemo(() => {
    return bookings
      .filter((b: any) => b.status === 'completed' && b.staff_id)
      .map((b: any) => {
        const staffMember = staff.find((s) => s.id === b.staff_id);
        const wageInfo = calcWage(b, staffMember);
        
        return {
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
          staff_name: staffMember?.name || 'Unassigned',
        };
      });
  }, [bookings, staff]);

  // Calculate payroll data - include ALL staff, even those without bookings
  const payrollData: StaffWithPayroll[] = useMemo(() => {
    return staff.map((s) => {
      // Filter completed bookings for this staff member in date range
      const staffBookings = bookings.filter((b: any) => b.staff_id === s.id && b.status === 'completed');
      
      // Calculate totals
      let totalHours = 0;
      let totalPay = 0;
      
      staffBookings.forEach((b: any) => {
        const wageInfo = calcWage(b, s);
        totalHours += wageInfo.hoursWorked;
        totalPay += wageInfo.calculatedPay;
      });

      // Calculate YTD earnings from completed bookings
      const ytdStaffBookings = ytdBookings.filter((b: any) => b.staff_id === s.id);
      let ytdEarnings = 0;
      ytdStaffBookings.forEach((b: any) => {
        const wageInfo = calcWage(b, s);
        ytdEarnings += wageInfo.calculatedPay;
      });

      // Count upcoming bookings for this staff
      const upcomingBookings = bookings.filter((b: any) => 
        b.staff_id === s.id && 
        !['completed', 'cancelled', 'no_show'].includes(b.status)
      ).length;

      // Check if 1099 and over $600 threshold
      const requiresTaxFiling = s.tax_classification === '1099' && ytdEarnings >= 600;

      const completedCleans = staffBookings.length;
      const avgPayPerClean = completedCleans > 0 ? totalPay / completedCleans : 0;

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
        completedCleans,
        avgPayPerClean: Math.round(avgPayPerClean * 100) / 100,
      };
    });
  }, [staff, bookings, ytdBookings]);

  // Summary stats
  const totalPayroll = payrollData.reduce((sum, s) => sum + s.totalPay, 0);
  const totalHours = payrollData.reduce((sum, s) => sum + s.totalHours, 0);
  const totalCleans = payrollData.reduce((sum, s) => sum + s.completedCleans, 0);
  const contractorsNeedingFiling = payrollData.filter((s) => s.requiresTaxFiling).length;
  const avgPayPerClean = totalCleans > 0 ? totalPayroll / totalCleans : 0;

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Tax Classification', 'Base Wage', 'Hours Worked', 'Cleans Completed', 'Period Pay', 'Avg Pay/Clean', 'YTD Earnings'];
    const rows = payrollData.map((s) => [
      s.name,
      s.email,
      s.tax_classification === 'w2' ? 'W-2 Employee' : '1099 Contractor',
      s.base_wage || s.hourly_rate || 0,
      s.totalHours,
      s.completedCleans,
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
    const rows = bookingPayrollDetails.map((b) => [
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
        <Button onClick={exportCSV} className="gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      }
    >
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
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
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Clock className="w-5 h-5 text-blue-500" />
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
              <div className="p-2 rounded-lg bg-green-500/10">
                <Briefcase className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cleans Completed</p>
                <p className="text-2xl font-bold">{isTestMode ? 'XX' : totalCleans}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Calculator className="w-5 h-5 text-purple-500" />
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
                contractorsNeedingFiling > 0 ? "bg-amber-500/10" : "bg-muted"
              )}>
                <AlertTriangle className={cn(
                  "w-5 h-5",
                  contractorsNeedingFiling > 0 ? "text-amber-500" : "text-muted-foreground"
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

      {/* Tabs for Summary and Details */}
      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList>
          <TabsTrigger value="summary">Staff Summary</TabsTrigger>
          <TabsTrigger value="details">Booking Details</TabsTrigger>
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
                      <TableCell className="text-right">{isTestMode ? 'X' : staff.completedCleans}</TableCell>
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
                  {bookingPayrollDetails.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(b.scheduled_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>#{b.booking_number}</TableCell>
                      <TableCell className="font-medium">{maskName(b.staff_name)}</TableCell>
                      <TableCell>{maskName(b.customer_name)}</TableCell>
                      <TableCell className="text-right">{isTestMode ? 'X.XX' : b.hours_worked.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {b.wage_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isTestMode ? '$XX.XX' : (b.wage_type === 'percentage' ? `${b.wage_rate}%` : `$${b.wage_rate.toFixed(2)}`)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {isTestMode ? '$XXX.XX' : `$${b.calculated_pay.toFixed(2)}`}
                      </TableCell>
                    </TableRow>
                  ))}
                  {bookingPayrollDetails.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No completed bookings with assigned staff for this period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
