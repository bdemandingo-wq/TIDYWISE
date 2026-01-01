import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { useToast } from '@/hooks/use-toast';
import { BookingWithDetails } from '@/hooks/useBookings';
import { Save, TrendingUp, TrendingDown, Target, DollarSign, Calculator, Plus, Trash2 } from 'lucide-react';
import { startOfYear, endOfYear, getMonth, getYear } from 'date-fns';
import type { Json } from '@/integrations/supabase/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PnLOverviewProps {
  bookings: BookingWithDetails[];
  customers: any[];
}

interface OverheadItem {
  name: string;
  monthly: number;
}

interface PnLSettings {
  id?: string;
  year: number;
  annual_revenue_goal: number;
  last_year_revenue: number;
  goal_repeat_revenue_percent: number;
  avg_job_size_goal: number;
  closing_rate_goal: number;
  first_time_to_recurring_goal: number;
  churn_rate_goal: number;
  monthly_sales_goals: number[];
  monthly_inbound_leads_goals: number[];
  marketing_percent_of_revenue: number;
  google_lsa_spend: number[];
  facebook_ads_spend: number[];
  other_online_spend: number[];
  local_marketing_spend: number[];
  direct_mail_spend: number[];
  contractor_percent: number;
  credit_card_percent: number;
  refunds_percent: number;
  fixed_overhead_items: OverheadItem[];
  variable_overhead_items: OverheadItem[];
  recruiting_costs: number[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const defaultSettings: PnLSettings = {
  year: new Date().getFullYear(),
  annual_revenue_goal: 0,
  last_year_revenue: 0,
  goal_repeat_revenue_percent: 50,
  avg_job_size_goal: 250,
  closing_rate_goal: 50,
  first_time_to_recurring_goal: 30,
  churn_rate_goal: 3,
  monthly_sales_goals: Array(12).fill(0),
  monthly_inbound_leads_goals: Array(12).fill(0),
  marketing_percent_of_revenue: 15,
  google_lsa_spend: Array(12).fill(0),
  facebook_ads_spend: Array(12).fill(0),
  other_online_spend: Array(12).fill(0),
  local_marketing_spend: Array(12).fill(0),
  direct_mail_spend: Array(12).fill(0),
  contractor_percent: 50,
  credit_card_percent: 2.9,
  refunds_percent: 2,
  fixed_overhead_items: [
    { name: 'Booking Software', monthly: 57 },
    { name: 'Insurance', monthly: 62 },
    { name: 'Website Hosting', monthly: 15 },
    { name: 'Phone/VoIP', monthly: 35 },
    { name: 'Accounting Software', monthly: 38 },
  ],
  variable_overhead_items: [
    { name: 'Supplies', monthly: 0 },
    { name: 'Gas/Mileage', monthly: 0 },
  ],
  recruiting_costs: Array(12).fill(0),
};

export function PnLOverview({ bookings, customers }: PnLOverviewProps) {
  const orgId = useOrgId();
  const { toast } = useToast();
  const [settings, setSettings] = useState<PnLSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('revenue-map');

  const currentYear = new Date().getFullYear();
  const organizationId = orgId.organizationId;

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      if (!organizationId) return;
      
      const { data, error } = await supabase
        .from('pnl_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('year', currentYear)
        .single();
      
      if (data) {
        setSettings({
          ...defaultSettings,
          ...data,
          annual_revenue_goal: Number(data.annual_revenue_goal) || 0,
          last_year_revenue: Number(data.last_year_revenue) || 0,
          goal_repeat_revenue_percent: Number(data.goal_repeat_revenue_percent) || 50,
          avg_job_size_goal: Number(data.avg_job_size_goal) || 250,
          closing_rate_goal: Number(data.closing_rate_goal) || 50,
          first_time_to_recurring_goal: Number(data.first_time_to_recurring_goal) || 30,
          churn_rate_goal: Number(data.churn_rate_goal) || 3,
          marketing_percent_of_revenue: Number(data.marketing_percent_of_revenue) || 15,
          contractor_percent: Number(data.contractor_percent) || 50,
          credit_card_percent: Number(data.credit_card_percent) || 2.9,
          refunds_percent: Number(data.refunds_percent) || 2,
          monthly_sales_goals: Array.isArray(data.monthly_sales_goals) ? (data.monthly_sales_goals as number[]) : defaultSettings.monthly_sales_goals,
          monthly_inbound_leads_goals: Array.isArray(data.monthly_inbound_leads_goals) ? (data.monthly_inbound_leads_goals as number[]) : defaultSettings.monthly_inbound_leads_goals,
          google_lsa_spend: Array.isArray(data.google_lsa_spend) ? (data.google_lsa_spend as number[]) : defaultSettings.google_lsa_spend,
          facebook_ads_spend: Array.isArray(data.facebook_ads_spend) ? (data.facebook_ads_spend as number[]) : defaultSettings.facebook_ads_spend,
          other_online_spend: Array.isArray(data.other_online_spend) ? (data.other_online_spend as number[]) : defaultSettings.other_online_spend,
          local_marketing_spend: Array.isArray(data.local_marketing_spend) ? (data.local_marketing_spend as number[]) : defaultSettings.local_marketing_spend,
          direct_mail_spend: Array.isArray(data.direct_mail_spend) ? (data.direct_mail_spend as number[]) : defaultSettings.direct_mail_spend,
          fixed_overhead_items: Array.isArray(data.fixed_overhead_items) ? (data.fixed_overhead_items as unknown as OverheadItem[]) : defaultSettings.fixed_overhead_items,
          variable_overhead_items: Array.isArray(data.variable_overhead_items) ? (data.variable_overhead_items as unknown as OverheadItem[]) : defaultSettings.variable_overhead_items,
          recruiting_costs: Array.isArray(data.recruiting_costs) ? (data.recruiting_costs as number[]) : defaultSettings.recruiting_costs,
        });
      }
      setLoading(false);
    };
    
    fetchSettings();
  }, [organizationId, currentYear]);

  // Calculate actuals from bookings
  const actuals = useMemo(() => {
    const yearStart = startOfYear(new Date(currentYear, 0, 1));
    const yearEnd = endOfYear(new Date(currentYear, 0, 1));
    
    const yearBookings = bookings.filter(b => {
      const date = new Date(b.scheduled_at);
      return date >= yearStart && date <= yearEnd && b.status !== 'cancelled';
    });
    
    // Monthly revenue actuals
    const monthlyRevenue = Array(12).fill(0);
    const monthlyJobCount = Array(12).fill(0);
    const monthlyFirstTimeCustomers = Array(12).fill(0);
    const monthlyRepeatCustomers = Array(12).fill(0);
    const monthlyFirstTimeRevenue = Array(12).fill(0);
    const monthlyRecurringRevenue = Array(12).fill(0);
    
    // Track customer first booking dates
    const customerFirstBooking: Record<string, Date> = {};
    bookings.forEach(b => {
      const customerId = b.customer?.id;
      if (customerId && b.status === 'completed') {
        const date = new Date(b.scheduled_at);
        if (!customerFirstBooking[customerId] || date < customerFirstBooking[customerId]) {
          customerFirstBooking[customerId] = date;
        }
      }
    });
    
    yearBookings.forEach(b => {
      if (b.status === 'completed') {
        const month = getMonth(new Date(b.scheduled_at));
        const amount = Number(b.total_amount || 0);
        monthlyRevenue[month] += amount;
        monthlyJobCount[month] += 1;
        
        // Check if first-time or repeat
        const customerId = b.customer?.id;
        if (customerId && customerFirstBooking[customerId]) {
          const firstBookingMonth = getMonth(customerFirstBooking[customerId]);
          const firstBookingYear = getYear(customerFirstBooking[customerId]);
          if (firstBookingYear === currentYear && firstBookingMonth === month) {
            monthlyFirstTimeCustomers[month] += 1;
            monthlyFirstTimeRevenue[month] += amount;
          } else {
            monthlyRepeatCustomers[month] += 1;
            monthlyRecurringRevenue[month] += amount;
          }
        }
      }
    });
    
    const totalRevenue = monthlyRevenue.reduce((a, b) => a + b, 0);
    const totalJobs = monthlyJobCount.reduce((a, b) => a + b, 0);
    const avgJobSize = totalJobs > 0 ? totalRevenue / totalJobs : 0;
    const totalFirstTime = monthlyFirstTimeCustomers.reduce((a, b) => a + b, 0);
    const totalRepeat = monthlyRepeatCustomers.reduce((a, b) => a + b, 0);
    const totalFirstTimeRevenue = monthlyFirstTimeRevenue.reduce((a, b) => a + b, 0);
    const totalRecurringRevenue = monthlyRecurringRevenue.reduce((a, b) => a + b, 0);
    
    // Calculate customer retention rate (unique recurring customers / total unique customers)
    const uniqueCustomers = new Set(yearBookings.filter(b => b.customer?.id).map(b => b.customer!.id));
    const recurringCustomerIds = new Set<string>();
    yearBookings.forEach(b => {
      if (b.status === 'completed' && b.customer?.id) {
        const customerId = b.customer.id;
        const firstBookingYear = customerFirstBooking[customerId] ? getYear(customerFirstBooking[customerId]) : null;
        if (firstBookingYear && firstBookingYear < currentYear) {
          recurringCustomerIds.add(customerId);
        }
      }
    });
    const retentionRate = uniqueCustomers.size > 0 ? (recurringCustomerIds.size / uniqueCustomers.size) * 100 : 0;
    
    return {
      monthlyRevenue,
      monthlyJobCount,
      monthlyFirstTimeCustomers,
      monthlyRepeatCustomers,
      monthlyFirstTimeRevenue,
      monthlyRecurringRevenue,
      totalRevenue,
      totalJobs,
      avgJobSize,
      totalFirstTime,
      totalRepeat,
      totalFirstTimeRevenue,
      totalRecurringRevenue,
      repeatRevenuePercent: totalRevenue > 0 ? (totalRecurringRevenue / totalRevenue) * 100 : 0,
      retentionRate,
      uniqueCustomers: uniqueCustomers.size,
    };
  }, [bookings, currentYear]);

  const saveSettings = async () => {
    if (!organizationId) return;
    setSaving(true);
    
    const payload = {
      organization_id: organizationId,
      year: currentYear,
      annual_revenue_goal: settings.annual_revenue_goal,
      last_year_revenue: settings.last_year_revenue,
      goal_repeat_revenue_percent: settings.goal_repeat_revenue_percent,
      avg_job_size_goal: settings.avg_job_size_goal,
      closing_rate_goal: settings.closing_rate_goal,
      first_time_to_recurring_goal: settings.first_time_to_recurring_goal,
      churn_rate_goal: settings.churn_rate_goal,
      monthly_sales_goals: settings.monthly_sales_goals,
      monthly_inbound_leads_goals: settings.monthly_inbound_leads_goals,
      marketing_percent_of_revenue: settings.marketing_percent_of_revenue,
      google_lsa_spend: settings.google_lsa_spend,
      facebook_ads_spend: settings.facebook_ads_spend,
      other_online_spend: settings.other_online_spend,
      local_marketing_spend: settings.local_marketing_spend,
      direct_mail_spend: settings.direct_mail_spend,
      contractor_percent: settings.contractor_percent,
      credit_card_percent: settings.credit_card_percent,
      refunds_percent: settings.refunds_percent,
      fixed_overhead_items: settings.fixed_overhead_items as unknown as Json,
      variable_overhead_items: settings.variable_overhead_items as unknown as Json,
      recruiting_costs: settings.recruiting_costs,
    };

    // Check if record exists
    const { data: existing } = await supabase
      .from('pnl_settings')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('year', currentYear)
      .single();

    let error;
    if (existing) {
      const result = await supabase
        .from('pnl_settings')
        .update(payload)
        .eq('id', existing.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('pnl_settings')
        .insert(payload);
      error = result.error;
    }
    
    setSaving(false);
    
    if (error) {
      toast({ title: 'Error saving settings', variant: 'destructive' });
    } else {
      toast({ title: 'Settings saved successfully' });
    }
  };

  const updateMonthlyGoal = (index: number, value: number) => {
    const newGoals = [...settings.monthly_sales_goals];
    newGoals[index] = value;
    setSettings({ ...settings, monthly_sales_goals: newGoals });
  };

  const updateMonthlyLeads = (index: number, value: number) => {
    const newLeads = [...settings.monthly_inbound_leads_goals];
    newLeads[index] = value;
    setSettings({ ...settings, monthly_inbound_leads_goals: newLeads });
  };

  const updateMarketingSpend = (channel: keyof PnLSettings, index: number, value: number) => {
    const currentArray = settings[channel] as number[];
    const newArray = [...currentArray];
    newArray[index] = value;
    setSettings({ ...settings, [channel]: newArray });
  };

  const addOverheadItem = (type: 'fixed' | 'variable') => {
    const key = type === 'fixed' ? 'fixed_overhead_items' : 'variable_overhead_items';
    setSettings({
      ...settings,
      [key]: [...settings[key], { name: '', monthly: 0 }],
    });
  };

  const removeOverheadItem = (type: 'fixed' | 'variable', index: number) => {
    const key = type === 'fixed' ? 'fixed_overhead_items' : 'variable_overhead_items';
    const newItems = settings[key].filter((_, i) => i !== index);
    setSettings({ ...settings, [key]: newItems });
  };

  const updateOverheadItem = (type: 'fixed' | 'variable', index: number, field: 'name' | 'monthly', value: string | number) => {
    const key = type === 'fixed' ? 'fixed_overhead_items' : 'variable_overhead_items';
    const newItems = [...settings[key]];
    newItems[index] = { ...newItems[index], [field]: value };
    setSettings({ ...settings, [key]: newItems });
  };

  // Calculate derived values
  const totalSalesGoal = settings.monthly_sales_goals.reduce((a, b) => a + b, 0);
  const totalMarketingBudget = settings.annual_revenue_goal * (settings.marketing_percent_of_revenue / 100);
  const progressPercent = settings.annual_revenue_goal > 0 ? (actuals.totalRevenue / settings.annual_revenue_goal) * 100 : 0;
  
  const quarterlyGoals = [
    settings.monthly_sales_goals.slice(0, 3).reduce((a, b) => a + b, 0),
    settings.monthly_sales_goals.slice(3, 6).reduce((a, b) => a + b, 0),
    settings.monthly_sales_goals.slice(6, 9).reduce((a, b) => a + b, 0),
    settings.monthly_sales_goals.slice(9, 12).reduce((a, b) => a + b, 0),
  ];
  const quarterlyActuals = [
    actuals.monthlyRevenue.slice(0, 3).reduce((a, b) => a + b, 0),
    actuals.monthlyRevenue.slice(3, 6).reduce((a, b) => a + b, 0),
    actuals.monthlyRevenue.slice(6, 9).reduce((a, b) => a + b, 0),
    actuals.monthlyRevenue.slice(9, 12).reduce((a, b) => a + b, 0),
  ];

  // P&L Calculations
  const pnlData = useMemo(() => {
    return MONTHS.map((month, i) => {
      const revenue = actuals.monthlyRevenue[i];
      const projectedRevenue = settings.monthly_sales_goals[i] || 0;
      
      // COGS
      const contractorCost = revenue * (settings.contractor_percent / 100);
      const ccProcessing = revenue * (settings.credit_card_percent / 100);
      const refunds = revenue * (settings.refunds_percent / 100);
      const totalCOGS = contractorCost + ccProcessing + refunds;
      const grossProfit = revenue - totalCOGS;
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
      
      // Fixed Overhead
      const fixedOverhead = settings.fixed_overhead_items.reduce((sum, item) => sum + (item.monthly || 0), 0);
      
      // Variable Overhead
      const variableOverhead = settings.variable_overhead_items.reduce((sum, item) => sum + (item.monthly || 0), 0);
      
      // Marketing
      const marketing = (settings.google_lsa_spend[i] || 0) + 
                        (settings.facebook_ads_spend[i] || 0) + 
                        (settings.other_online_spend[i] || 0) + 
                        (settings.local_marketing_spend[i] || 0) + 
                        (settings.direct_mail_spend[i] || 0);
      
      // Recruiting
      const recruiting = settings.recruiting_costs[i] || 0;
      
      const totalExpenses = fixedOverhead + variableOverhead + marketing + recruiting;
      const netProfit = grossProfit - totalExpenses;
      const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
      
      return {
        month,
        revenue,
        projectedRevenue,
        contractorCost,
        ccProcessing,
        refunds,
        totalCOGS,
        grossProfit,
        grossMargin,
        fixedOverhead,
        variableOverhead,
        marketing,
        recruiting,
        totalExpenses,
        netProfit,
        profitMargin,
      };
    });
  }, [actuals, settings]);

  const pnlTotals = useMemo(() => {
    return pnlData.reduce((acc, month) => ({
      revenue: acc.revenue + month.revenue,
      projectedRevenue: acc.projectedRevenue + month.projectedRevenue,
      contractorCost: acc.contractorCost + month.contractorCost,
      ccProcessing: acc.ccProcessing + month.ccProcessing,
      refunds: acc.refunds + month.refunds,
      totalCOGS: acc.totalCOGS + month.totalCOGS,
      grossProfit: acc.grossProfit + month.grossProfit,
      fixedOverhead: acc.fixedOverhead + month.fixedOverhead,
      variableOverhead: acc.variableOverhead + month.variableOverhead,
      marketing: acc.marketing + month.marketing,
      recruiting: acc.recruiting + month.recruiting,
      totalExpenses: acc.totalExpenses + month.totalExpenses,
      netProfit: acc.netProfit + month.netProfit,
    }), {
      revenue: 0, projectedRevenue: 0, contractorCost: 0, ccProcessing: 0, refunds: 0,
      totalCOGS: 0, grossProfit: 0, fixedOverhead: 0, variableOverhead: 0,
      marketing: 0, recruiting: 0, totalExpenses: 0, netProfit: 0,
    });
  }, [pnlData]);

  // Marketing budget calculations
  const monthlyMarketingTotals = MONTHS.map((_, i) => {
    return (settings.google_lsa_spend[i] || 0) + 
           (settings.facebook_ads_spend[i] || 0) + 
           (settings.other_online_spend[i] || 0) + 
           (settings.local_marketing_spend[i] || 0) + 
           (settings.direct_mail_spend[i] || 0);
  });
  
  const totalMarketingSpend = monthlyMarketingTotals.reduce((a, b) => a + b, 0);
  
  // Marketing KPIs - CPL and CPA (linked to actuals)
  const totalLeadsGoal = settings.monthly_inbound_leads_goals.reduce((a, b) => a + b, 0);
  const costPerLead = totalLeadsGoal > 0 ? totalMarketingSpend / totalLeadsGoal : 0;
  const costPerAcquisition = actuals.totalFirstTime > 0 ? totalMarketingSpend / actuals.totalFirstTime : 0;
  
  // Status helpers
  const getStatus = (actual: number, goal: number, higherIsBetter = true): 'on-track' | 'behind' | 'ahead' | 'at-risk' => {
    if (goal === 0) return 'on-track';
    const ratio = actual / goal;
    if (higherIsBetter) {
      if (ratio >= 1) return 'ahead';
      if (ratio >= 0.9) return 'on-track';
      if (ratio >= 0.7) return 'at-risk';
      return 'behind';
    } else {
      if (ratio <= 1) return 'ahead';
      if (ratio <= 1.1) return 'on-track';
      if (ratio <= 1.3) return 'at-risk';
      return 'behind';
    }
  };
  
  const statusColors = {
    'ahead': 'bg-green-500/20 text-green-700 dark:text-green-400',
    'on-track': 'bg-green-500/20 text-green-700 dark:text-green-400',
    'at-risk': 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    'behind': 'bg-red-500/20 text-red-700 dark:text-red-400',
  };
  
  const statusIcons = {
    'ahead': '✅',
    'on-track': '✅',
    'at-risk': '⚠️',
    'behind': '🔴',
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with Save Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">P&L Overview - {currentYear}</h2>
          <p className="text-muted-foreground">Track revenue goals, marketing budgets, and profitability</p>
        </div>
        <Button onClick={saveSettings} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Revenue Goal</p>
                <p className="text-2xl font-bold">${settings.annual_revenue_goal.toLocaleString()}</p>
              </div>
              <Target className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">YTD Revenue</p>
                <p className="text-2xl font-bold">${actuals.totalRevenue.toLocaleString()}</p>
              </div>
              <DollarSign className="w-8 h-8 text-success opacity-50" />
            </div>
            <div className="mt-2">
              <Badge variant={progressPercent >= (new Date().getMonth() + 1) / 12 * 100 ? 'default' : 'destructive'}>
                {progressPercent.toFixed(1)}% of goal
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Job Size</p>
                <p className="text-2xl font-bold">${actuals.avgJobSize.toFixed(0)}</p>
              </div>
              <Calculator className="w-8 h-8 text-info opacity-50" />
            </div>
            <div className="mt-2">
              <Badge variant={actuals.avgJobSize >= settings.avg_job_size_goal ? 'default' : 'secondary'}>
                Goal: ${settings.avg_job_size_goal}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net Profit YTD</p>
                <p className={`text-2xl font-bold ${pnlTotals.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                  ${pnlTotals.netProfit.toLocaleString()}
                </p>
              </div>
              {pnlTotals.netProfit >= 0 ? (
                <TrendingUp className="w-8 h-8 text-success opacity-50" />
              ) : (
                <TrendingDown className="w-8 h-8 text-destructive opacity-50" />
              )}
            </div>
            <div className="mt-2">
              <Badge variant={pnlTotals.revenue > 0 && (pnlTotals.netProfit / pnlTotals.revenue) * 100 >= 20 ? 'default' : 'secondary'}>
                {pnlTotals.revenue > 0 ? ((pnlTotals.netProfit / pnlTotals.revenue) * 100).toFixed(1) : 0}% margin
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progress to Annual Goal</span>
            <span className="text-sm text-muted-foreground">
              ${actuals.totalRevenue.toLocaleString()} / ${settings.annual_revenue_goal.toLocaleString()}
            </span>
          </div>
          <Progress value={Math.min(progressPercent, 100)} className="h-3" />
        </CardContent>
      </Card>

      {/* P&L Summary Table with Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">P&L Summary at a Glance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Goal</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Total Revenue</TableCell>
                <TableCell className="text-right">${actuals.totalRevenue.toLocaleString()}</TableCell>
                <TableCell className="text-right">${settings.annual_revenue_goal.toLocaleString()}</TableCell>
                <TableCell className="text-center">
                  <Badge className={statusColors[getStatus(actuals.totalRevenue, settings.annual_revenue_goal * (new Date().getMonth() + 1) / 12)]}>
                    {statusIcons[getStatus(actuals.totalRevenue, settings.annual_revenue_goal * (new Date().getMonth() + 1) / 12)]} {getStatus(actuals.totalRevenue, settings.annual_revenue_goal * (new Date().getMonth() + 1) / 12) === 'behind' ? 'Behind' : 'On Track'}
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium pl-6 text-muted-foreground">→ First-Time Revenue</TableCell>
                <TableCell className="text-right">${actuals.totalFirstTimeRevenue.toLocaleString()}</TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="text-center text-muted-foreground">—</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium pl-6 text-muted-foreground">→ Recurring Revenue</TableCell>
                <TableCell className="text-right">${actuals.totalRecurringRevenue.toLocaleString()}</TableCell>
                <TableCell className="text-right">{settings.goal_repeat_revenue_percent}% of total</TableCell>
                <TableCell className="text-center">
                  <Badge className={statusColors[getStatus(actuals.repeatRevenuePercent, settings.goal_repeat_revenue_percent)]}>
                    {statusIcons[getStatus(actuals.repeatRevenuePercent, settings.goal_repeat_revenue_percent)]} {actuals.repeatRevenuePercent.toFixed(0)}%
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Field Labor ({settings.contractor_percent}%)</TableCell>
                <TableCell className="text-right text-destructive">-${pnlTotals.contractorCost.toLocaleString()}</TableCell>
                <TableCell className="text-right">-${(settings.annual_revenue_goal * settings.contractor_percent / 100).toLocaleString()}</TableCell>
                <TableCell className="text-center">
                  <Badge className={statusColors[getStatus(settings.annual_revenue_goal * settings.contractor_percent / 100 * (new Date().getMonth() + 1) / 12, pnlTotals.contractorCost, false)]}>
                    {statusIcons[getStatus(settings.annual_revenue_goal * settings.contractor_percent / 100 * (new Date().getMonth() + 1) / 12, pnlTotals.contractorCost, false)]} On Track
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Marketing Spend</TableCell>
                <TableCell className="text-right text-destructive">-${totalMarketingSpend.toLocaleString()}</TableCell>
                <TableCell className="text-right">-${totalMarketingBudget.toLocaleString()}</TableCell>
                <TableCell className="text-center">
                  <Badge className={statusColors[getStatus(totalMarketingBudget, totalMarketingSpend, false)]}>
                    {statusIcons[getStatus(totalMarketingBudget, totalMarketingSpend, false)]} {totalMarketingSpend <= totalMarketingBudget ? 'Under Budget' : 'Over Budget'}
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Fixed Costs</TableCell>
                <TableCell className="text-right text-destructive">-${pnlTotals.fixedOverhead.toLocaleString()}</TableCell>
                <TableCell className="text-right text-muted-foreground">-${(settings.fixed_overhead_items.reduce((sum, item) => sum + (item.monthly || 0), 0) * 12).toLocaleString()}</TableCell>
                <TableCell className="text-center text-muted-foreground">—</TableCell>
              </TableRow>
              <TableRow className="bg-muted/50 border-t-2">
                <TableCell className="font-bold">Net Profit</TableCell>
                <TableCell className={`text-right font-bold ${pnlTotals.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${pnlTotals.netProfit.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-medium">
                  ${(settings.annual_revenue_goal * 0.2).toLocaleString()} (20% goal)
                </TableCell>
                <TableCell className="text-center">
                  <Badge className={statusColors[pnlTotals.revenue > 0 && (pnlTotals.netProfit / pnlTotals.revenue) * 100 >= 20 ? 'ahead' : pnlTotals.revenue > 0 && (pnlTotals.netProfit / pnlTotals.revenue) * 100 >= 10 ? 'at-risk' : 'behind']}>
                    {pnlTotals.revenue > 0 && (pnlTotals.netProfit / pnlTotals.revenue) * 100 >= 20 ? '✅' : '⚠️'} {pnlTotals.revenue > 0 ? ((pnlTotals.netProfit / pnlTotals.revenue) * 100).toFixed(1) : 0}% margin
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Avg Job Size</p>
            <p className="text-xl font-bold">${actuals.avgJobSize.toFixed(0)}</p>
            <Badge variant={actuals.avgJobSize >= settings.avg_job_size_goal ? 'default' : 'secondary'} className="mt-1">
              Goal: ${settings.avg_job_size_goal}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">First-Time Clients</p>
            <p className="text-xl font-bold">{actuals.totalFirstTime}</p>
            <p className="text-xs text-muted-foreground">${actuals.totalFirstTimeRevenue.toLocaleString()} revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Recurring Clients</p>
            <p className="text-xl font-bold">{actuals.totalRepeat}</p>
            <p className="text-xs text-muted-foreground">${actuals.totalRecurringRevenue.toLocaleString()} revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Cost Per Lead (CPL)</p>
            <p className="text-xl font-bold">${costPerLead.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{totalLeadsGoal} leads goal</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Cost Per Acquisition (CPA)</p>
            <p className="text-xl font-bold">${costPerAcquisition.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">{actuals.totalFirstTime} new customers</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="revenue-map">Revenue Map</TabsTrigger>
          <TabsTrigger value="marketing">Marketing Budget</TabsTrigger>
          <TabsTrigger value="pnl">P&L Statement</TabsTrigger>
        </TabsList>

        {/* Revenue Map Tab */}
        <TabsContent value="revenue-map" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Goals Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Revenue Goals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Annual Revenue Goal ($)</Label>
                    <Input
                      type="number"
                      value={settings.annual_revenue_goal}
                      onChange={(e) => setSettings({ ...settings, annual_revenue_goal: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Last Year Revenue ($)</Label>
                    <Input
                      type="number"
                      value={settings.last_year_revenue}
                      onChange={(e) => setSettings({ ...settings, last_year_revenue: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Avg Job Size Goal ($)</Label>
                    <Input
                      type="number"
                      value={settings.avg_job_size_goal}
                      onChange={(e) => setSettings({ ...settings, avg_job_size_goal: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Closing Rate Goal (%)</Label>
                    <Input
                      type="number"
                      value={settings.closing_rate_goal}
                      onChange={(e) => setSettings({ ...settings, closing_rate_goal: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Repeat Revenue Goal (%)</Label>
                    <Input
                      type="number"
                      value={settings.goal_repeat_revenue_percent}
                      onChange={(e) => setSettings({ ...settings, goal_repeat_revenue_percent: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>1st Time → Recurring (%)</Label>
                    <Input
                      type="number"
                      value={settings.first_time_to_recurring_goal}
                      onChange={(e) => setSettings({ ...settings, first_time_to_recurring_goal: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KPIs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Key Metrics (Actuals)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Jobs YTD</p>
                    <p className="text-2xl font-bold">{actuals.totalJobs}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Avg Job Size</p>
                    <p className="text-2xl font-bold">${actuals.avgJobSize.toFixed(0)}</p>
                    <Badge variant={actuals.avgJobSize >= settings.avg_job_size_goal ? 'default' : 'secondary'} className="mt-1">
                      {actuals.avgJobSize >= settings.avg_job_size_goal ? '✅' : '⚠️'} Goal: ${settings.avg_job_size_goal}
                    </Badge>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">First-Time Clients</p>
                    <p className="text-2xl font-bold">{actuals.totalFirstTime}</p>
                    <p className="text-xs text-muted-foreground">${actuals.totalFirstTimeRevenue.toLocaleString()} revenue</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Repeat Clients</p>
                    <p className="text-2xl font-bold">{actuals.totalRepeat}</p>
                    <p className="text-xs text-muted-foreground">${actuals.totalRecurringRevenue.toLocaleString()} revenue</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Revenue Breakdown by Client Type</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Revenue Type</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                    <TableHead className="text-right">Goal %</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">First-Time Client Revenue</TableCell>
                    <TableCell className="text-right">${actuals.totalFirstTimeRevenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{actuals.totalRevenue > 0 ? ((actuals.totalFirstTimeRevenue / actuals.totalRevenue) * 100).toFixed(1) : 0}%</TableCell>
                    <TableCell className="text-right text-muted-foreground">{100 - settings.goal_repeat_revenue_percent}%</TableCell>
                    <TableCell className="text-center">—</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Recurring Client Revenue</TableCell>
                    <TableCell className="text-right">${actuals.totalRecurringRevenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{actuals.repeatRevenuePercent.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{settings.goal_repeat_revenue_percent}%</TableCell>
                    <TableCell className="text-center">
                      <Badge className={statusColors[getStatus(actuals.repeatRevenuePercent, settings.goal_repeat_revenue_percent)]}>
                        {statusIcons[getStatus(actuals.repeatRevenuePercent, settings.goal_repeat_revenue_percent)]} {actuals.repeatRevenuePercent >= settings.goal_repeat_revenue_percent ? 'On Track' : 'Review'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-muted/50 border-t">
                    <TableCell className="font-bold">Total Revenue</TableCell>
                    <TableCell className="text-right font-bold">${actuals.totalRevenue.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-bold">100%</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-center">
                      <Badge className={statusColors[getStatus(actuals.totalRevenue, settings.annual_revenue_goal * (new Date().getMonth() + 1) / 12)]}>
                        {statusIcons[getStatus(actuals.totalRevenue, settings.annual_revenue_goal * (new Date().getMonth() + 1) / 12)]} {progressPercent.toFixed(0)}% of goal
                      </Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Bookings Required Calculator */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bookings Required to Hit Goal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 border rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Annual Goal</p>
                  <p className="text-xl font-bold">${settings.annual_revenue_goal.toLocaleString()}</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Bookings/Year Needed</p>
                  <p className="text-xl font-bold">{settings.avg_job_size_goal > 0 ? Math.ceil(settings.annual_revenue_goal / settings.avg_job_size_goal) : 0}</p>
                  <p className="text-xs text-muted-foreground">@ ${settings.avg_job_size_goal}/job</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Bookings/Month</p>
                  <p className="text-xl font-bold">{settings.avg_job_size_goal > 0 ? Math.ceil(settings.annual_revenue_goal / settings.avg_job_size_goal / 12) : 0}</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Bookings/Week</p>
                  <p className="text-xl font-bold">{settings.avg_job_size_goal > 0 ? Math.ceil(settings.annual_revenue_goal / settings.avg_job_size_goal / 52) : 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Sales Goals Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monthly Sales Goals vs Actuals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Goal ($)</TableHead>
                      <TableHead className="text-right">Actual ($)</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead className="text-right">Jobs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MONTHS.map((month, i) => {
                      const goal = settings.monthly_sales_goals[i];
                      const actual = actuals.monthlyRevenue[i];
                      const variance = actual - goal;
                      return (
                        <TableRow key={month}>
                          <TableCell className="font-medium">{month}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              value={goal}
                              onChange={(e) => updateMonthlyGoal(i, Number(e.target.value))}
                              className="w-24 text-right ml-auto"
                            />
                          </TableCell>
                          <TableCell className="text-right">${actual.toLocaleString()}</TableCell>
                          <TableCell className={`text-right ${variance >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {variance >= 0 ? '+' : ''}{variance.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">{actuals.monthlyJobCount[i]}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="font-bold border-t-2">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right">${totalSalesGoal.toLocaleString()}</TableCell>
                      <TableCell className="text-right">${actuals.totalRevenue.toLocaleString()}</TableCell>
                      <TableCell className={`text-right ${actuals.totalRevenue - totalSalesGoal >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {actuals.totalRevenue - totalSalesGoal >= 0 ? '+' : ''}{(actuals.totalRevenue - totalSalesGoal).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">{actuals.totalJobs}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Quarterly Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quarterly Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
                  <div key={q} className="p-4 border rounded-lg">
                    <p className="font-medium mb-2">{q}</p>
                    <p className="text-sm text-muted-foreground">Goal</p>
                    <p className="text-lg font-bold">${quarterlyGoals[i].toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground mt-2">Actual</p>
                    <p className={`text-lg font-bold ${quarterlyActuals[i] >= quarterlyGoals[i] ? 'text-success' : 'text-destructive'}`}>
                      ${quarterlyActuals[i].toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Marketing Budget Tab */}
        <TabsContent value="marketing" className="space-y-6">
          {/* Marketing KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Total Budget</p>
                <p className="text-2xl font-bold">${totalMarketingBudget.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{settings.marketing_percent_of_revenue}% of revenue goal</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Planned Spend</p>
                <p className={`text-2xl font-bold ${totalMarketingSpend <= totalMarketingBudget ? 'text-green-600' : 'text-red-600'}`}>
                  ${totalMarketingSpend.toLocaleString()}
                </p>
                <Badge className={statusColors[getStatus(totalMarketingBudget, totalMarketingSpend, false)]}>
                  {totalMarketingSpend <= totalMarketingBudget ? '✅ Under Budget' : '🔴 Over Budget'}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Cost Per Lead (CPL)</p>
                <p className="text-2xl font-bold">${costPerLead.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{totalLeadsGoal} leads / yr goal</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Cost Per Acquisition (CPA)</p>
                <p className="text-2xl font-bold">${costPerAcquisition.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{actuals.totalFirstTime} new customers YTD</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Marketing Budget Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label>Marketing % of Revenue</Label>
                  <Input
                    type="number"
                    value={settings.marketing_percent_of_revenue}
                    onChange={(e) => setSettings({ ...settings, marketing_percent_of_revenue: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Lead Count Goal (Annual)</Label>
                  <p className="text-lg font-medium">{totalLeadsGoal}</p>
                  <p className="text-xs text-muted-foreground">Sum of monthly lead goals below</p>
                </div>
                <div>
                  <Label>Closing Rate Goal</Label>
                  <p className="text-lg font-medium">{settings.closing_rate_goal}%</p>
                  <p className="text-xs text-muted-foreground">Expected {Math.round(totalLeadsGoal * settings.closing_rate_goal / 100)} new customers</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Lead Goals */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monthly Inbound Lead Goals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      {MONTHS.map(m => <TableHead key={m} className="text-right text-xs">{m}</TableHead>)}
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Lead Goal</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="p-1">
                          <Input
                            type="number"
                            value={settings.monthly_inbound_leads_goals[i]}
                            onChange={(e) => updateMonthlyLeads(i, Number(e.target.value))}
                            className="w-16 text-xs text-right"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-bold">{totalLeadsGoal}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-muted-foreground">Expected Sales</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="text-right text-xs text-muted-foreground">
                          {Math.round(settings.monthly_inbound_leads_goals[i] * settings.closing_rate_goal / 100)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium">{Math.round(totalLeadsGoal * settings.closing_rate_goal / 100)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium text-muted-foreground">Actual New Customers</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="text-right text-xs">
                          {actuals.monthlyFirstTimeCustomers[i]}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium">{actuals.totalFirstTime}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monthly Marketing Spend by Channel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      {MONTHS.map(m => <TableHead key={m} className="text-right text-xs">{m}</TableHead>)}
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { key: 'google_lsa_spend', name: 'Google LSA' },
                      { key: 'facebook_ads_spend', name: 'Facebook Ads' },
                      { key: 'other_online_spend', name: 'Other Online' },
                      { key: 'local_marketing_spend', name: 'Local Marketing' },
                      { key: 'direct_mail_spend', name: 'Direct Mail' },
                    ].map(({ key, name }) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium">{name}</TableCell>
                        {MONTHS.map((_, i) => (
                          <TableCell key={i} className="p-1">
                            <Input
                              type="number"
                              value={(settings[key as keyof PnLSettings] as number[])[i]}
                              onChange={(e) => updateMarketingSpend(key as keyof PnLSettings, i, Number(e.target.value))}
                              className="w-16 text-xs text-right"
                            />
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-bold">
                          ${(settings[key as keyof PnLSettings] as number[]).reduce((a, b) => a + b, 0).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2">
                      <TableCell>TOTAL</TableCell>
                      {monthlyMarketingTotals.map((total, i) => (
                        <TableCell key={i} className="text-right text-xs">${total.toLocaleString()}</TableCell>
                      ))}
                      <TableCell className="text-right">${totalMarketingSpend.toLocaleString()}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* P&L Statement Tab */}
        <TabsContent value="pnl" className="space-y-6">
          {/* COGS Settings */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cost of Goods Sold (COGS)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Contractor/Labor %</Label>
                    <Input
                      type="number"
                      value={settings.contractor_percent}
                      onChange={(e) => setSettings({ ...settings, contractor_percent: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>CC Processing %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={settings.credit_card_percent}
                      onChange={(e) => setSettings({ ...settings, credit_card_percent: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Refunds %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={settings.refunds_percent}
                      onChange={(e) => setSettings({ ...settings, refunds_percent: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">YTD Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Gross Profit</p>
                    <p className="text-xl font-bold">${pnlTotals.grossProfit.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {pnlTotals.revenue > 0 ? ((pnlTotals.grossProfit / pnlTotals.revenue) * 100).toFixed(1) : 0}% margin
                    </p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Net Profit</p>
                    <p className={`text-xl font-bold ${pnlTotals.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                      ${pnlTotals.netProfit.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pnlTotals.revenue > 0 ? ((pnlTotals.netProfit / pnlTotals.revenue) * 100).toFixed(1) : 0}% margin
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Overhead Items */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Fixed Overhead (Monthly)</CardTitle>
                <Button variant="outline" size="sm" onClick={() => addOverheadItem('fixed')}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {settings.fixed_overhead_items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={item.name}
                      onChange={(e) => updateOverheadItem('fixed', i, 'name', e.target.value)}
                      placeholder="Item name"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={item.monthly}
                      onChange={(e) => updateOverheadItem('fixed', i, 'monthly', Number(e.target.value))}
                      className="w-24"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeOverheadItem('fixed', i)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium">
                    Total: ${settings.fixed_overhead_items.reduce((sum, item) => sum + (item.monthly || 0), 0).toLocaleString()}/mo
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Variable Overhead (Monthly)</CardTitle>
                <Button variant="outline" size="sm" onClick={() => addOverheadItem('variable')}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {settings.variable_overhead_items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={item.name}
                      onChange={(e) => updateOverheadItem('variable', i, 'name', e.target.value)}
                      placeholder="Item name"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={item.monthly}
                      onChange={(e) => updateOverheadItem('variable', i, 'monthly', Number(e.target.value))}
                      className="w-24"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeOverheadItem('variable', i)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium">
                    Total: ${settings.variable_overhead_items.reduce((sum, item) => sum + (item.monthly || 0), 0).toLocaleString()}/mo
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* P&L Statement Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monthly P&L Statement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      {MONTHS.map(m => <TableHead key={m} className="text-right text-xs">{m}</TableHead>)}
                      <TableHead className="text-right">YTD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/50">
                      <TableCell className="font-bold">Revenue</TableCell>
                      {pnlData.map((d, i) => <TableCell key={i} className="text-right text-xs">${d.revenue.toLocaleString()}</TableCell>)}
                      <TableCell className="text-right font-bold">${pnlTotals.revenue.toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-4 text-muted-foreground">Contractor/Labor</TableCell>
                      {pnlData.map((d, i) => <TableCell key={i} className="text-right text-xs text-destructive">-${d.contractorCost.toFixed(0)}</TableCell>)}
                      <TableCell className="text-right text-destructive">-${pnlTotals.contractorCost.toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-4 text-muted-foreground">CC Processing</TableCell>
                      {pnlData.map((d, i) => <TableCell key={i} className="text-right text-xs text-destructive">-${d.ccProcessing.toFixed(0)}</TableCell>)}
                      <TableCell className="text-right text-destructive">-${pnlTotals.ccProcessing.toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-4 text-muted-foreground">Refunds</TableCell>
                      {pnlData.map((d, i) => <TableCell key={i} className="text-right text-xs text-destructive">-${d.refunds.toFixed(0)}</TableCell>)}
                      <TableCell className="text-right text-destructive">-${pnlTotals.refunds.toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow className="bg-muted/30 border-t">
                      <TableCell className="font-bold">Gross Profit</TableCell>
                      {pnlData.map((d, i) => <TableCell key={i} className="text-right text-xs font-medium">${d.grossProfit.toFixed(0)}</TableCell>)}
                      <TableCell className="text-right font-bold">${pnlTotals.grossProfit.toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-4 text-muted-foreground">Fixed Overhead</TableCell>
                      {pnlData.map((d, i) => <TableCell key={i} className="text-right text-xs text-destructive">-${d.fixedOverhead.toFixed(0)}</TableCell>)}
                      <TableCell className="text-right text-destructive">-${pnlTotals.fixedOverhead.toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-4 text-muted-foreground">Variable Overhead</TableCell>
                      {pnlData.map((d, i) => <TableCell key={i} className="text-right text-xs text-destructive">-${d.variableOverhead.toFixed(0)}</TableCell>)}
                      <TableCell className="text-right text-destructive">-${pnlTotals.variableOverhead.toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-4 text-muted-foreground">Marketing</TableCell>
                      {pnlData.map((d, i) => <TableCell key={i} className="text-right text-xs text-destructive">-${d.marketing.toFixed(0)}</TableCell>)}
                      <TableCell className="text-right text-destructive">-${pnlTotals.marketing.toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow className="bg-muted/50 border-t-2">
                      <TableCell className="font-bold">Net Profit</TableCell>
                      {pnlData.map((d, i) => (
                        <TableCell key={i} className={`text-right text-xs font-bold ${d.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                          ${d.netProfit.toFixed(0)}
                        </TableCell>
                      ))}
                      <TableCell className={`text-right font-bold ${pnlTotals.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                        ${pnlTotals.netProfit.toLocaleString()}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Profit Margin %</TableCell>
                      {pnlData.map((d, i) => (
                        <TableCell key={i} className={`text-right text-xs ${d.profitMargin >= 20 ? 'text-success' : d.profitMargin >= 10 ? 'text-warning' : 'text-destructive'}`}>
                          {d.profitMargin.toFixed(0)}%
                        </TableCell>
                      ))}
                      <TableCell className={`text-right font-medium ${pnlTotals.revenue > 0 && (pnlTotals.netProfit / pnlTotals.revenue) * 100 >= 20 ? 'text-success' : 'text-destructive'}`}>
                        {pnlTotals.revenue > 0 ? ((pnlTotals.netProfit / pnlTotals.revenue) * 100).toFixed(1) : 0}%
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}