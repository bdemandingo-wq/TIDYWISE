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
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { 
  CalendarIcon, 
  Download, 
  DollarSign, 
  TrendingDown,
  CreditCard,
  Receipt,
  PiggyBank,
  Calculator,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { SubscriptionGate } from '@/components/admin/SubscriptionGate';
import { PnLCalendar } from '@/components/admin/PnLCalendar';

interface Transaction {
  id: string;
  booking_number: number;
  customer_name: string;
  service_name: string;
  scheduled_at: string;
  gross_amount: number;
  processing_fee: number;
  net_amount: number;
  cleaner_pay: number;
  zip_code: string | null;
  status: string;
  payment_status: string;
}

export default function FinancePage() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const { maskName, isTestMode } = useTestMode();

  // Fetch completed bookings with payment data - scoped to organization
  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings-finance', organizationId, dateRange],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers(*),
          service:services(*),
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

  // Fetch team assignment pay for accurate labor costs
  const bookingIds = useMemo(() => bookings.map((b: any) => b.id), [bookings]);
  const { data: teamPaysByBooking = new Map<string, number>() } = useQuery({
    queryKey: ['finance-team-pay', organizationId, bookingIds.join(',')],
    queryFn: async () => {
      if (!organizationId || bookingIds.length === 0) return new Map<string, number>();
      const { data, error } = await supabase
        .from('booking_team_assignments')
        .select('booking_id, pay_share, staff_id')
        .eq('organization_id', organizationId)
        .in('booking_id', bookingIds);
      if (error) throw error;

      const bookingTeamMap = new Map<string, any[]>();
      for (const row of data || []) {
        const bid = String((row as any).booking_id);
        if (!bookingTeamMap.has(bid)) bookingTeamMap.set(bid, []);
        bookingTeamMap.get(bid)!.push(row);
      }

      const map = new Map<string, number>();
      for (const [bid, members] of bookingTeamMap) {
        let totalPay = 0;
        let hasAnyPay = false;
        for (const m of members) {
          const payShare = Number((m as any).pay_share);
          if (Number.isFinite(payShare) && payShare > 0) {
            totalPay += payShare;
            hasAnyPay = true;
          }
        }
        if (hasAnyPay) {
          map.set(bid, totalPay);
        }
      }
      return map;
    },
    enabled: !!organizationId && bookingIds.length > 0,
  });

  // Fetch expenses for the date range - scoped to organization
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses-finance', organizationId, dateRange],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('expense_date', format(dateRange.from, 'yyyy-MM-dd'))
        .lte('expense_date', format(dateRange.to, 'yyyy-MM-dd'));
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Transform bookings to transactions with calculated fees
  const transactions: Transaction[] = useMemo(() => {
    return bookings.map((b: any) => {
      const grossAmount = Number(b.total_amount) || 0;
      // Stripe fee: 2.9% + $0.30
      const processingFee = (grossAmount * 0.029) + 0.30;
      const netAmount = grossAmount - processingFee;
      
      // Calculate cleaner pay - use single source of truth: cleaner_pay_expected
      const teamPay = teamPaysByBooking.get(b.id);
      let cleanerPay = 0;
      if (teamPay != null && teamPay > 0) {
        cleanerPay = teamPay;
      } else if (b.cleaner_pay_expected != null && Number(b.cleaner_pay_expected) > 0) {
        cleanerPay = Number(b.cleaner_pay_expected);
      } else if (b.cleaner_actual_payment != null && Number(b.cleaner_actual_payment) > 0) {
        cleanerPay = Number(b.cleaner_actual_payment);
      } else if (b.cleaner_wage) {
        const wage = Number(b.cleaner_wage);
        const wageType = b.cleaner_wage_type || 'hourly';
        if (wageType === 'flat') {
          cleanerPay = wage;
        } else if (wageType === 'percentage') {
          cleanerPay = (grossAmount * wage) / 100;
        } else {
          const hours = b.cleaner_override_hours || (b.duration / 60);
          cleanerPay = wage * hours;
        }
      }

      return {
        id: b.id,
        booking_number: b.booking_number,
        customer_name: b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : 'Unknown',
        service_name: b.service?.name || (b.total_amount === 0 ? 'Re-clean' : 'Service'),
        scheduled_at: b.scheduled_at,
        gross_amount: grossAmount,
        processing_fee: Math.round(processingFee * 100) / 100,
        net_amount: Math.round(netAmount * 100) / 100,
        cleaner_pay: Math.round(cleanerPay * 100) / 100,
        zip_code: b.zip_code,
        status: b.status,
        payment_status: b.payment_status,
      };
    });
  }, [bookings, teamPaysByBooking]);

  // Calculate P&L metrics - exclude cancelled bookings
  const metrics = useMemo(() => {
    // Exclude cancelled bookings from all calculations
    const activeTransactions = transactions.filter(t => t.status !== 'cancelled');
    const paidTransactions = activeTransactions.filter(t => t.payment_status === 'paid' || t.payment_status === 'partial');
    
    // Total sales from active bookings in range (excludes cancelled)
    const totalSales = activeTransactions.reduce((sum, t) => sum + t.gross_amount, 0);
    const totalFees = activeTransactions.reduce((sum, t) => sum + t.processing_fee, 0);
    const totalCleanerPay = activeTransactions.reduce((sum, t) => sum + t.cleaner_pay, 0);
    const refundedTransactions = activeTransactions.filter(t => t.payment_status === 'refunded');
    const totalRefunds = refundedTransactions.reduce((sum, t) => sum + t.gross_amount, 0);
    
    // Calculate expenses by category
    const expensesByCategory: Record<string, number> = {};
    expenses.forEach((e: any) => {
      const category = e.category || 'other';
      expensesByCategory[category] = (expensesByCategory[category] || 0) + Number(e.amount);
    });
    
    const totalExpenses = expenses.reduce((sum, e: any) => sum + Number(e.amount), 0);
    
    const netRevenue = totalSales - totalFees;
    const netProfit = netRevenue - totalCleanerPay - totalExpenses - totalRefunds;
    const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

    return {
      totalSales: Math.round(totalSales * 100) / 100,
      totalFees: Math.round(totalFees * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
      totalCleanerPay: Math.round(totalCleanerPay * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      expensesByCategory,
      totalRefunds: Math.round(totalRefunds * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 10) / 10,
      transactionCount: activeTransactions.length,
    };
  }, [transactions, expenses]);

  // Sales tax by zip code
  const salesTaxByZip = useMemo(() => {
    const zipMap = new Map<string, { count: number; total: number }>();
    transactions.forEach(t => {
      const zip = t.zip_code || 'No Zip';
      const existing = zipMap.get(zip) || { count: 0, total: 0 };
      zipMap.set(zip, {
        count: existing.count + 1,
        total: existing.total + t.gross_amount,
      });
    });
    return Array.from(zipMap.entries()).map(([zip, data]) => ({
      zip_code: zip,
      ...data,
      // Assume 7% sales tax for cleaning services (varies by state)
      estimated_tax: Math.round(data.total * 0.07 * 100) / 100,
    }));
  }, [transactions]);


  // Export functions
  const exportQuickBooksCSV = () => {
    const headers = ['Date', 'Transaction ID', 'Customer', 'Service', 'Gross Amount', 'Processing Fee', 'Net Amount', 'Category'];
    const rows = transactions.map(t => [
      format(new Date(t.scheduled_at), 'yyyy-MM-dd'),
      `#${t.booking_number}`,
      t.customer_name,
      t.service_name,
      t.gross_amount.toFixed(2),
      t.processing_fee.toFixed(2),
      t.net_amount.toFixed(2),
      'Cleaning Services',
    ]);
    downloadCSV('quickbooks-export', headers, rows);
  };

  const exportAnnualIncome = () => {
    // Use proper CSV format with quoted headers to ensure all columns show
    const headers = ['"Period"', '"Total Sales"', '"Processing Fees"', '"Net Revenue"', '"Cleaner Pay"', '"Expenses"', '"Refunds"', '"Net Profit"', '"Profit Margin %"'];
    const rows = [[
      `"${format(dateRange.from, 'MMM d, yyyy')} - ${format(dateRange.to, 'MMM d, yyyy')}"`,
      metrics.totalSales.toFixed(2),
      metrics.totalFees.toFixed(2),
      metrics.netRevenue.toFixed(2),
      metrics.totalCleanerPay.toFixed(2),
      metrics.totalExpenses.toFixed(2),
      metrics.totalRefunds.toFixed(2),
      metrics.netProfit.toFixed(2),
      metrics.profitMargin.toFixed(1),
    ]];
    downloadCSV('annual-income-report', headers, rows);
  };

  const exportSalesTaxByZip = () => {
    const headers = ['Zip Code', 'Transaction Count', 'Total Revenue', 'Estimated Sales Tax (7%)'];
    const rows = salesTaxByZip.map(z => [
      z.zip_code,
      z.count.toString(),
      z.total.toFixed(2),
      z.estimated_tax.toFixed(2),
    ]);
    downloadCSV('sales-tax-by-zipcode', headers, rows);
  };

  const downloadCSV = (filename: string, headers: string[], rows: string[][]) => {
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout
      title="Finance & Taxes"
      subtitle="Profit & loss, transactions, and tax exports"
    >
      <SubscriptionGate feature="Finance & Tax reports">
      {/* Date Range Selector */}
      <div className="flex items-center gap-4 mb-6">
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

        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" className="gap-2" onClick={exportQuickBooksCSV}>
            <Download className="w-4 h-4" />
            QuickBooks/Xero
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportAnnualIncome}>
            <Download className="w-4 h-4" />
            Income Report
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportSalesTaxByZip}>
            <Download className="w-4 h-4" />
            Sales Tax by Zip
          </Button>
        </div>
      </div>

      {/* P&L Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Total Sales</span>
            </div>
            <p className="text-xl font-bold text-green-600">
              {isTestMode ? '$X,XXX.XX' : `$${metrics.totalSales.toFixed(2)}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Processing Fees</span>
            </div>
            <p className="text-xl font-bold text-orange-600">
              {isTestMode ? '-$XXX.XX' : `-$${metrics.totalFees.toFixed(2)}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Cleaner Pay</span>
            </div>
            <p className="text-xl font-bold text-blue-600">
              {isTestMode ? '-$X,XXX.XX' : `-$${metrics.totalCleanerPay.toFixed(2)}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Refunds</span>
            </div>
            <p className="text-xl font-bold text-red-600">
              {isTestMode ? '-$X.XX' : `-$${metrics.totalRefunds.toFixed(2)}`}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Net Profit</span>
            </div>
            <p className={cn(
              "text-xl font-bold",
              metrics.netProfit >= 0 ? "text-primary" : "text-red-600"
            )}>
              {isTestMode ? '$X,XXX.XX' : `$${metrics.netProfit.toFixed(2)}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Profit Margin</span>
            </div>
            <p className={cn(
              "text-xl font-bold",
              metrics.profitMargin >= 20 ? "text-green-600" : metrics.profitMargin >= 10 ? "text-yellow-600" : "text-red-600"
            )}>
              {isTestMode ? 'XX.X%' : `${metrics.profitMargin.toFixed(1)}%`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="pnl-calendar">P&L Calendar</TabsTrigger>
          <TabsTrigger value="sales-tax">Sales Tax by Zip</TabsTrigger>
          <TabsTrigger value="pnl">P&L Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Booking #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Gross Amount</TableHead>
                    <TableHead className="text-right">Processing Fee</TableHead>
                    <TableHead className="text-right">Net Amount</TableHead>
                    <TableHead className="text-right">Cleaner Pay</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(t.scheduled_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>#{t.booking_number}</TableCell>
                      <TableCell>{maskName(t.customer_name)}</TableCell>
                      <TableCell>{t.service_name}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {isTestMode ? '$XXX.XX' : `$${t.gross_amount.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        {isTestMode ? '-$X.XX' : `-$${t.processing_fee.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {isTestMode ? '$XXX.XX' : `$${t.net_amount.toFixed(2)}`}
                      </TableCell>
                      <TableCell className="text-right text-blue-600">
                        {isTestMode ? '$XX.XX' : `$${t.cleaner_pay.toFixed(2)}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.payment_status === 'paid' ? 'default' : 'secondary'}>
                          {t.payment_status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No transactions for the selected period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pnl-calendar">
          <PnLCalendar
            bookings={bookings}
            expenses={expenses}
            teamPaysByBooking={teamPaysByBooking as Map<string, number>}
          />
        </TabsContent>

        <TabsContent value="sales-tax">
          <Card>
            <CardHeader>
              <CardTitle>Sales Tax by Zip Code</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zip Code</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                    <TableHead className="text-right">Estimated Tax (7%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesTaxByZip.map((row) => (
                    <TableRow key={row.zip_code}>
                      <TableCell className="font-medium">{row.zip_code}</TableCell>
                      <TableCell className="text-right">{isTestMode ? 'X' : row.count}</TableCell>
                      <TableCell className="text-right">{isTestMode ? '$XXX.XX' : `$${row.total.toFixed(2)}`}</TableCell>
                      <TableCell className="text-right font-medium text-primary">
                        {isTestMode ? '$XX.XX' : `$${row.estimated_tax.toFixed(2)}`}
                      </TableCell>
                    </TableRow>
                  ))}
                  {salesTaxByZip.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No data for the selected period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pnl">
          <Card>
            <CardHeader>
              <CardTitle>Profit & Loss Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-w-md">
                <div className="flex justify-between items-center py-3 border-b">
                  <span className="font-medium">Total Sales (Gross)</span>
                  <span className="text-lg font-bold text-green-600">{isTestMode ? '+$X,XXX.XX' : `+$${metrics.totalSales.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b">
                  <span className="text-muted-foreground">Less: Processing Fees</span>
                  <span className="text-orange-600">{isTestMode ? '-$XXX.XX' : `-$${metrics.totalFees.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b bg-muted/50 px-3 rounded">
                  <span className="font-medium">Net Revenue</span>
                  <span className="font-bold">{isTestMode ? '$X,XXX.XX' : `$${metrics.netRevenue.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b">
                  <span className="text-muted-foreground">Less: Cleaner Pay</span>
                  <span className="text-blue-600">{isTestMode ? '-$X,XXX.XX' : `-$${metrics.totalCleanerPay.toFixed(2)}`}</span>
                </div>
                {Object.entries(metrics.expensesByCategory).map(([category, amount]) => (
                  <div key={category} className="flex justify-between items-center py-3 border-b">
                    <span className="text-muted-foreground">Less: {category.charAt(0).toUpperCase() + category.slice(1)}</span>
                    <span className="text-muted-foreground">{isTestMode ? '-$XXX.XX' : `-$${(amount as number).toFixed(2)}`}</span>
                  </div>
                ))}
                {Object.keys(metrics.expensesByCategory).length === 0 && (
                  <div className="flex justify-between items-center py-3 border-b">
                    <span className="text-muted-foreground">Less: Expenses</span>
                    <span className="text-muted-foreground">{isTestMode ? '-$XXX.XX' : '-$0.00'}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-3 border-b">
                  <span className="text-muted-foreground">Less: Refunds</span>
                  <span className="text-red-600">{isTestMode ? '-$X.XX' : `-$${metrics.totalRefunds.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between items-center py-4 bg-primary/10 px-3 rounded-lg">
                  <span className="text-lg font-bold">Net Profit</span>
                  <span className={cn(
                    "text-xl font-bold",
                    metrics.netProfit >= 0 ? "text-primary" : "text-red-600"
                  )}>
                    {isTestMode ? '$X,XXX.XX' : `$${metrics.netProfit.toFixed(2)}`}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </SubscriptionGate>
    </AdminLayout>
  );
}
