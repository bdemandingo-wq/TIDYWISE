import { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, startOfYear, isWithinInterval } from 'date-fns';
import { CalendarIcon, Download, AlertTriangle, DollarSign, Users, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

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
}

export default function PayrollPage() {
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  // Fetch staff
  const { data: staff = [] } = useQuery({
    queryKey: ['staff-payroll'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  // Fetch completed bookings for payroll calculation
  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings-payroll', dateRange],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('status', 'completed')
        .gte('scheduled_at', dateRange.from.toISOString())
        .lte('scheduled_at', dateRange.to.toISOString());
      if (error) throw error;
      return data;
    },
  });

  // Fetch YTD bookings for 1099 threshold
  const { data: ytdBookings = [] } = useQuery({
    queryKey: ['bookings-ytd'],
    queryFn: async () => {
      const yearStart = startOfYear(new Date());
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('status', 'completed')
        .gte('scheduled_at', yearStart.toISOString());
      if (error) throw error;
      return data;
    },
  });

  // Calculate payroll data
  const payrollData: StaffWithPayroll[] = useMemo(() => {
    return staff.map((s) => {
      // Filter bookings for this staff member in date range
      const staffBookings = bookings.filter((b) => b.staff_id === s.id);
      
      // Calculate hours from bookings (duration is in minutes)
      const totalMinutes = staffBookings.reduce((sum, b) => {
        const hours = b.cleaner_override_hours || (b.duration / 60);
        return sum + hours * 60;
      }, 0);
      const totalHours = totalMinutes / 60;

      // Calculate pay using actual payment if available, otherwise base_wage * hours
      const totalPay = staffBookings.reduce((sum, b) => {
        if (b.cleaner_actual_payment) {
          return sum + Number(b.cleaner_actual_payment);
        }
        const hours = b.cleaner_override_hours || (b.duration / 60);
        const wage = b.cleaner_wage || s.base_wage || s.hourly_rate || 0;
        return sum + (hours * Number(wage));
      }, 0);

      // Calculate YTD earnings
      const ytdStaffBookings = ytdBookings.filter((b) => b.staff_id === s.id);
      const ytdEarnings = ytdStaffBookings.reduce((sum, b) => {
        if (b.cleaner_actual_payment) {
          return sum + Number(b.cleaner_actual_payment);
        }
        const hours = b.cleaner_override_hours || (b.duration / 60);
        const wage = b.cleaner_wage || s.base_wage || s.hourly_rate || 0;
        return sum + (hours * Number(wage));
      }, 0);

      // Check if 1099 and over $600 threshold
      const requiresTaxFiling = s.tax_classification === '1099' && ytdEarnings >= 600;

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
      };
    });
  }, [staff, bookings, ytdBookings]);

  // Summary stats
  const totalPayroll = payrollData.reduce((sum, s) => sum + s.totalPay, 0);
  const totalHours = payrollData.reduce((sum, s) => sum + s.totalHours, 0);
  const contractorsNeedingFiling = payrollData.filter((s) => s.requiresTaxFiling).length;

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Tax Classification', 'Base Wage', 'Hours Worked', 'Period Pay', 'YTD Earnings'];
    const rows = payrollData.map((s) => [
      s.name,
      s.email,
      s.tax_classification === 'w2' ? 'W-2 Employee' : '1099 Contractor',
      s.base_wage || s.hourly_rate || 0,
      s.totalHours,
      s.totalPay,
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
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    setDateRange({ from: range.from, to: range.to });
                  }
                }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Payroll</p>
                <p className="text-2xl font-bold">${totalPayroll.toFixed(2)}</p>
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
                <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Users className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Staff Members</p>
                <p className="text-2xl font-bold">{payrollData.length}</p>
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
                <p className="text-2xl font-bold">{contractorsNeedingFiling}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 1099 Alert Banner */}
      {contractorsNeedingFiling > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800">1099 Tax Filing Required</h3>
                <p className="text-sm text-amber-700 mt-1">
                  {contractorsNeedingFiling} contractor(s) have earned $600 or more this year and require 1099-NEC filing.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payroll Table */}
      <Card>
        <CardHeader>
          <CardTitle>Staff Payroll Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Tax Status</TableHead>
                <TableHead>Base Wage</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Period Pay</TableHead>
                <TableHead className="text-right">YTD Earnings</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollData.map((staff) => (
                <TableRow key={staff.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{staff.name}</p>
                      <p className="text-xs text-muted-foreground">{staff.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={staff.tax_classification === 'w2' ? 'default' : 'secondary'}>
                      {staff.tax_classification === 'w2' ? 'W-2' : '1099'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    ${(staff.base_wage || staff.hourly_rate || 0).toFixed(2)}/hr
                  </TableCell>
                  <TableCell className="text-right">{staff.totalHours}</TableCell>
                  <TableCell className="text-right font-medium">
                    ${staff.totalPay.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${staff.ytdEarnings.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {staff.requiresTaxFiling && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        1099 Required
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {payrollData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No payroll data for the selected period
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}
