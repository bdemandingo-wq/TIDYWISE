import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { useToast } from '@/hooks/use-toast';
import { BookingWithDetails } from '@/hooks/useBookings';
import { Save, TrendingUp, TrendingDown, Target, DollarSign, Calculator } from 'lucide-react';
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PnLOverviewProps {
  bookings: BookingWithDetails[];
  customers: any[];
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
  fixed_overhead_items: { name: string; monthly: number }[];
  variable_overhead_items: { name: string; monthly: number }[];
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
          fixed_overhead_items: Array.isArray(data.fixed_overhead_items) ? (data.fixed_overhead_items as { name: string; monthly: number }[]) : defaultSettings.fixed_overhead_items,
          variable_overhead_items: Array.isArray(data.variable_overhead_items) ? (data.variable_overhead_items as { name: string; monthly: number }[]) : defaultSettings.variable_overhead_items,
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
        monthlyRevenue[month] += Number(b.total_amount || 0);
        monthlyJobCount[month] += 1;
        
        // Check if first-time or repeat
        const customerId = b.customer?.id;
        if (customerId && customerFirstBooking[customerId]) {
          const firstBookingMonth = getMonth(customerFirstBooking[customerId]);
          const firstBookingYear = getYear(customerFirstBooking[customerId]);
          if (firstBookingYear === currentYear && firstBookingMonth === month) {
            monthlyFirstTimeCustomers[month] += 1;
          } else {
            monthlyRepeatCustomers[month] += 1;
          }
        }
      }
    });
    
    const totalRevenue = monthlyRevenue.reduce((a, b) => a + b, 0);
    const totalJobs = monthlyJobCount.reduce((a, b) => a + b, 0);
    const avgJobSize = totalJobs > 0 ? totalRevenue / totalJobs : 0;
    const totalFirstTime = monthlyFirstTimeCustomers.reduce((a, b) => a + b, 0);
    const totalRepeat = monthlyRepeatCustomers.reduce((a, b) => a + b, 0);
    
    return {
      monthlyRevenue,
      monthlyJobCount,
      monthlyFirstTimeCustomers,
      monthlyRepeatCustomers,
      totalRevenue,
      totalJobs,
      avgJobSize,
      totalFirstTime,
      totalRepeat,
      repeatRevenuePercent: totalRevenue > 0 ? (totalRepeat / (totalFirstTime + totalRepeat)) * 100 : 0,
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

  // Calculate derived values
  const totalSalesGoal = settings.monthly_sales_goals.reduce((a, b) => a + b, 0);
  const totalMarketingBudget = settings.annual_revenue_goal * (settings.marketing_percent_of_revenue / 100);
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
              <Badge variant={actuals.totalRevenue >= settings.annual_revenue_goal * (new Date().getMonth() + 1) / 12 ? 'default' : 'destructive'}>
                {settings.annual_revenue_goal > 0 ? ((actuals.totalRevenue / settings.annual_revenue_goal) * 100).toFixed(1) : 0}% of goal
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
            <div className="mt-2 text-sm text-muted-foreground">
              Goal: ${settings.avg_job_size_goal}
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
          </CardContent>
        </Card>
      </div>

      {/* Sub-tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="revenue-map">Revenue Map</TabsTrigger>
          <TabsTrigger value="marketing-budget">Marketing Budget</TabsTrigger>
          <TabsTrigger value="pnl">P&L Statement</TabsTrigger>
        </TabsList>

        {/* Revenue Map Tab */}
        <TabsContent value="revenue-map" className="space-y-6">
          {/* Goals Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Sales & Revenue Goals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>Annual Revenue Goal</Label>
                  <Input
                    type="number"
                    value={settings.annual_revenue_goal}
                    onChange={(e) => setSettings({ ...settings, annual_revenue_goal: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Last Year's Revenue</Label>
                  <Input
                    type="number"
                    value={settings.last_year_revenue}
                    onChange={(e) => setSettings({ ...settings, last_year_revenue: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Goal Repeat Revenue %</Label>
                  <Input
                    type="number"
                    value={settings.goal_repeat_revenue_percent}
                    onChange={(e) => setSettings({ ...settings, goal_repeat_revenue_percent: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Avg Job Size Goal</Label>
                  <Input
                    type="number"
                    value={settings.avg_job_size_goal}
                    onChange={(e) => setSettings({ ...settings, avg_job_size_goal: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Closing Rate Goal %</Label>
                  <Input
                    type="number"
                    value={settings.closing_rate_goal}
                    onChange={(e) => setSettings({ ...settings, closing_rate_goal: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>First-Time to Recurring %</Label>
                  <Input
                    type="number"
                    value={settings.first_time_to_recurring_goal}
                    onChange={(e) => setSettings({ ...settings, first_time_to_recurring_goal: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Churn Rate Goal %</Label>
                  <Input
                    type="number"
                    value={settings.churn_rate_goal}
                    onChange={(e) => setSettings({ ...settings, churn_rate_goal: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quarterly Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Quarterly Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
                  <div key={q} className="bg-secondary/30 rounded-lg p-4 text-center">
                    <p className="font-semibold text-primary">{q}</p>
                    <p className="text-lg font-bold">${quarterlyGoals[i].toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Goal</p>
                    <div className="border-t border-border my-2" />
                    <p className={`text-lg font-bold ${quarterlyActuals[i] >= quarterlyGoals[i] ? 'text-success' : 'text-foreground'}`}>
                      ${quarterlyActuals[i].toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">Actual</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Monthly Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Sales Goals & Actuals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      {MONTHS.map(m => <TableHead key={m} className="text-center">{m}</TableHead>)}
                      <TableHead className="text-center">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Sales Goal</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="p-1">
                          <Input
                            type="number"
                            value={settings.monthly_sales_goals[i] || 0}
                            onChange={(e) => updateMonthlyGoal(i, Number(e.target.value))}
                            className="w-20 text-center text-sm"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-bold">${totalSalesGoal.toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow className="bg-success/10">
                      <TableCell className="font-medium">Actual Revenue</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="text-center">${actuals.monthlyRevenue[i].toLocaleString()}</TableCell>
                      ))}
                      <TableCell className="text-center font-bold">${actuals.totalRevenue.toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Variance</TableCell>
                      {MONTHS.map((_, i) => {
                        const variance = actuals.monthlyRevenue[i] - (settings.monthly_sales_goals[i] || 0);
                        return (
                          <TableCell key={i} className={`text-center ${variance >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {variance >= 0 ? '+' : ''}{variance.toLocaleString()}
                          </TableCell>
                        );
                      })}
                      <TableCell className={`text-center font-bold ${actuals.totalRevenue - totalSalesGoal >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {actuals.totalRevenue - totalSalesGoal >= 0 ? '+' : ''}${(actuals.totalRevenue - totalSalesGoal).toLocaleString()}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Inbound Leads Goal</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="p-1">
                          <Input
                            type="number"
                            value={settings.monthly_inbound_leads_goals[i] || 0}
                            onChange={(e) => updateMonthlyLeads(i, Number(e.target.value))}
                            className="w-20 text-center text-sm"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-bold">{settings.monthly_inbound_leads_goals.reduce((a, b) => a + b, 0)}</TableCell>
                    </TableRow>
                    <TableRow className="bg-info/10">
                      <TableCell className="font-medium">Jobs Completed</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="text-center">{actuals.monthlyJobCount[i]}</TableCell>
                      ))}
                      <TableCell className="text-center font-bold">{actuals.totalJobs}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">First-Time Customers</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="text-center">{actuals.monthlyFirstTimeCustomers[i]}</TableCell>
                      ))}
                      <TableCell className="text-center font-bold">{actuals.totalFirstTime}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Repeat Customers</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="text-center">{actuals.monthlyRepeatCustomers[i]}</TableCell>
                      ))}
                      <TableCell className="text-center font-bold">{actuals.totalRepeat}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Marketing Budget Tab */}
        <TabsContent value="marketing-budget" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Marketing Budget Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <Label>% of Revenue for Marketing</Label>
                  <Input
                    type="number"
                    value={settings.marketing_percent_of_revenue}
                    onChange={(e) => setSettings({ ...settings, marketing_percent_of_revenue: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div className="bg-primary/10 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Total Marketing Budget</p>
                  <p className="text-2xl font-bold text-primary">${totalMarketingBudget.toLocaleString()}</p>
                </div>
                <div className="bg-success/10 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Allocated</p>
                  <p className="text-2xl font-bold text-success">
                    ${(settings.google_lsa_spend.reduce((a, b) => a + b, 0) +
                       settings.facebook_ads_spend.reduce((a, b) => a + b, 0) +
                       settings.other_online_spend.reduce((a, b) => a + b, 0) +
                       settings.local_marketing_spend.reduce((a, b) => a + b, 0) +
                       settings.direct_mail_spend.reduce((a, b) => a + b, 0)).toLocaleString()}
                  </p>
                </div>
                <div className="bg-warning/10 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Remaining</p>
                  <p className="text-2xl font-bold text-warning">
                    ${(totalMarketingBudget - (
                       settings.google_lsa_spend.reduce((a, b) => a + b, 0) +
                       settings.facebook_ads_spend.reduce((a, b) => a + b, 0) +
                       settings.other_online_spend.reduce((a, b) => a + b, 0) +
                       settings.local_marketing_spend.reduce((a, b) => a + b, 0) +
                       settings.direct_mail_spend.reduce((a, b) => a + b, 0)
                    )).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Marketing Spend by Channel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      {MONTHS.map(m => <TableHead key={m} className="text-center">{m}</TableHead>)}
                      <TableHead className="text-center">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-blue-500/10">
                      <TableCell className="font-medium">Google LSA</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="p-1">
                          <Input
                            type="number"
                            value={settings.google_lsa_spend[i] || 0}
                            onChange={(e) => updateMarketingSpend('google_lsa_spend', i, Number(e.target.value))}
                            className="w-16 text-center text-sm"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-bold">${settings.google_lsa_spend.reduce((a, b) => a + b, 0).toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow className="bg-blue-600/10">
                      <TableCell className="font-medium">Facebook Ads</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="p-1">
                          <Input
                            type="number"
                            value={settings.facebook_ads_spend[i] || 0}
                            onChange={(e) => updateMarketingSpend('facebook_ads_spend', i, Number(e.target.value))}
                            className="w-16 text-center text-sm"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-bold">${settings.facebook_ads_spend.reduce((a, b) => a + b, 0).toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow className="bg-purple-500/10">
                      <TableCell className="font-medium">Other Online</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="p-1">
                          <Input
                            type="number"
                            value={settings.other_online_spend[i] || 0}
                            onChange={(e) => updateMarketingSpend('other_online_spend', i, Number(e.target.value))}
                            className="w-16 text-center text-sm"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-bold">${settings.other_online_spend.reduce((a, b) => a + b, 0).toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow className="bg-green-500/10">
                      <TableCell className="font-medium">Local Marketing</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="p-1">
                          <Input
                            type="number"
                            value={settings.local_marketing_spend[i] || 0}
                            onChange={(e) => updateMarketingSpend('local_marketing_spend', i, Number(e.target.value))}
                            className="w-16 text-center text-sm"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-bold">${settings.local_marketing_spend.reduce((a, b) => a + b, 0).toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow className="bg-orange-500/10">
                      <TableCell className="font-medium">Direct Mail</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="p-1">
                          <Input
                            type="number"
                            value={settings.direct_mail_spend[i] || 0}
                            onChange={(e) => updateMarketingSpend('direct_mail_spend', i, Number(e.target.value))}
                            className="w-16 text-center text-sm"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-bold">${settings.direct_mail_spend.reduce((a, b) => a + b, 0).toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow className="bg-muted font-bold">
                      <TableCell>Monthly Total</TableCell>
                      {MONTHS.map((_, i) => {
                        const total = (settings.google_lsa_spend[i] || 0) +
                                      (settings.facebook_ads_spend[i] || 0) +
                                      (settings.other_online_spend[i] || 0) +
                                      (settings.local_marketing_spend[i] || 0) +
                                      (settings.direct_mail_spend[i] || 0);
                        return <TableCell key={i} className="text-center">${total.toLocaleString()}</TableCell>;
                      })}
                      <TableCell className="text-center">
                        ${(settings.google_lsa_spend.reduce((a, b) => a + b, 0) +
                           settings.facebook_ads_spend.reduce((a, b) => a + b, 0) +
                           settings.other_online_spend.reduce((a, b) => a + b, 0) +
                           settings.local_marketing_spend.reduce((a, b) => a + b, 0) +
                           settings.direct_mail_spend.reduce((a, b) => a + b, 0)).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* P&L Statement Tab */}
        <TabsContent value="pnl" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cost Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Contractor % (of revenue)</Label>
                  <Input
                    type="number"
                    value={settings.contractor_percent}
                    onChange={(e) => setSettings({ ...settings, contractor_percent: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Credit Card Processing %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={settings.credit_card_percent}
                    onChange={(e) => setSettings({ ...settings, credit_card_percent: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Refunds/Discounts %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={settings.refunds_percent}
                    onChange={(e) => setSettings({ ...settings, refunds_percent: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profit & Loss Statement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      {MONTHS.map(m => <TableHead key={m} className="text-center text-xs">{m}</TableHead>)}
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">% Rev</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Revenue */}
                    <TableRow className="bg-success/20 font-bold">
                      <TableCell>Revenue</TableCell>
                      {pnlData.map((m, i) => (
                        <TableCell key={i} className="text-center text-xs">${m.revenue.toLocaleString()}</TableCell>
                      ))}
                      <TableCell className="text-center">${pnlTotals.revenue.toLocaleString()}</TableCell>
                      <TableCell className="text-center">100%</TableCell>
                    </TableRow>

                    {/* COGS Header */}
                    <TableRow className="bg-orange-500/20">
                      <TableCell colSpan={14} className="font-bold text-orange-700">Cost of Goods Sold (COGS)</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-6">Contractor Pay ({settings.contractor_percent}%)</TableCell>
                      {pnlData.map((m, i) => (
                        <TableCell key={i} className="text-center text-xs">${m.contractorCost.toFixed(0)}</TableCell>
                      ))}
                      <TableCell className="text-center">${pnlTotals.contractorCost.toFixed(0)}</TableCell>
                      <TableCell className="text-center">{settings.contractor_percent}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-6">Credit Card ({settings.credit_card_percent}%)</TableCell>
                      {pnlData.map((m, i) => (
                        <TableCell key={i} className="text-center text-xs">${m.ccProcessing.toFixed(0)}</TableCell>
                      ))}
                      <TableCell className="text-center">${pnlTotals.ccProcessing.toFixed(0)}</TableCell>
                      <TableCell className="text-center">{settings.credit_card_percent}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-6">Refunds/Discounts ({settings.refunds_percent}%)</TableCell>
                      {pnlData.map((m, i) => (
                        <TableCell key={i} className="text-center text-xs">${m.refunds.toFixed(0)}</TableCell>
                      ))}
                      <TableCell className="text-center">${pnlTotals.refunds.toFixed(0)}</TableCell>
                      <TableCell className="text-center">{settings.refunds_percent}%</TableCell>
                    </TableRow>
                    <TableRow className="bg-orange-500/10 font-semibold">
                      <TableCell>Total COGS</TableCell>
                      {pnlData.map((m, i) => (
                        <TableCell key={i} className="text-center text-xs">${m.totalCOGS.toFixed(0)}</TableCell>
                      ))}
                      <TableCell className="text-center">${pnlTotals.totalCOGS.toFixed(0)}</TableCell>
                      <TableCell className="text-center">{pnlTotals.revenue > 0 ? ((pnlTotals.totalCOGS / pnlTotals.revenue) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>

                    {/* Gross Profit */}
                    <TableRow className="bg-green-500/20 font-bold">
                      <TableCell>Gross Profit</TableCell>
                      {pnlData.map((m, i) => (
                        <TableCell key={i} className="text-center text-xs">${m.grossProfit.toFixed(0)}</TableCell>
                      ))}
                      <TableCell className="text-center">${pnlTotals.grossProfit.toFixed(0)}</TableCell>
                      <TableCell className="text-center">{pnlTotals.revenue > 0 ? ((pnlTotals.grossProfit / pnlTotals.revenue) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>

                    {/* Operating Expenses Header */}
                    <TableRow className="bg-blue-500/20">
                      <TableCell colSpan={14} className="font-bold text-blue-700">Operating Expenses</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-6">Fixed Overhead</TableCell>
                      {pnlData.map((m, i) => (
                        <TableCell key={i} className="text-center text-xs">${m.fixedOverhead.toFixed(0)}</TableCell>
                      ))}
                      <TableCell className="text-center">${pnlTotals.fixedOverhead.toFixed(0)}</TableCell>
                      <TableCell className="text-center">{pnlTotals.revenue > 0 ? ((pnlTotals.fixedOverhead / pnlTotals.revenue) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-6">Variable Overhead</TableCell>
                      {pnlData.map((m, i) => (
                        <TableCell key={i} className="text-center text-xs">${m.variableOverhead.toFixed(0)}</TableCell>
                      ))}
                      <TableCell className="text-center">${pnlTotals.variableOverhead.toFixed(0)}</TableCell>
                      <TableCell className="text-center">{pnlTotals.revenue > 0 ? ((pnlTotals.variableOverhead / pnlTotals.revenue) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-6">Marketing</TableCell>
                      {pnlData.map((m, i) => (
                        <TableCell key={i} className="text-center text-xs">${m.marketing.toFixed(0)}</TableCell>
                      ))}
                      <TableCell className="text-center">${pnlTotals.marketing.toFixed(0)}</TableCell>
                      <TableCell className="text-center">{pnlTotals.revenue > 0 ? ((pnlTotals.marketing / pnlTotals.revenue) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="pl-6">Recruiting</TableCell>
                      {pnlData.map((m, i) => (
                        <TableCell key={i} className="text-center text-xs">${m.recruiting.toFixed(0)}</TableCell>
                      ))}
                      <TableCell className="text-center">${pnlTotals.recruiting.toFixed(0)}</TableCell>
                      <TableCell className="text-center">{pnlTotals.revenue > 0 ? ((pnlTotals.recruiting / pnlTotals.revenue) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>
                    <TableRow className="bg-blue-500/10 font-semibold">
                      <TableCell>Total Expenses</TableCell>
                      {pnlData.map((m, i) => (
                        <TableCell key={i} className="text-center text-xs">${m.totalExpenses.toFixed(0)}</TableCell>
                      ))}
                      <TableCell className="text-center">${pnlTotals.totalExpenses.toFixed(0)}</TableCell>
                      <TableCell className="text-center">{pnlTotals.revenue > 0 ? ((pnlTotals.totalExpenses / pnlTotals.revenue) * 100).toFixed(1) : 0}%</TableCell>
                    </TableRow>

                    {/* Net Profit */}
                    <TableRow className={`font-bold ${pnlTotals.netProfit >= 0 ? 'bg-success/30' : 'bg-destructive/30'}`}>
                      <TableCell>Net Profit</TableCell>
                      {pnlData.map((m, i) => (
                        <TableCell key={i} className={`text-center text-xs ${m.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                          ${m.netProfit.toFixed(0)}
                        </TableCell>
                      ))}
                      <TableCell className={`text-center ${pnlTotals.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                        ${pnlTotals.netProfit.toFixed(0)}
                      </TableCell>
                      <TableCell className={`text-center ${pnlTotals.netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {pnlTotals.revenue > 0 ? ((pnlTotals.netProfit / pnlTotals.revenue) * 100).toFixed(1) : 0}%
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Fixed Overhead Items */}
          <Card>
            <CardHeader>
              <CardTitle>Fixed Overhead Items (Monthly)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {settings.fixed_overhead_items.map((item, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Input
                      value={item.name}
                      onChange={(e) => {
                        const newItems = [...settings.fixed_overhead_items];
                        newItems[i] = { ...newItems[i], name: e.target.value };
                        setSettings({ ...settings, fixed_overhead_items: newItems });
                      }}
                      placeholder="Item name"
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={item.monthly}
                      onChange={(e) => {
                        const newItems = [...settings.fixed_overhead_items];
                        newItems[i] = { ...newItems[i], monthly: Number(e.target.value) };
                        setSettings({ ...settings, fixed_overhead_items: newItems });
                      }}
                      className="w-24"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const newItems = settings.fixed_overhead_items.filter((_, idx) => idx !== i);
                        setSettings({ ...settings, fixed_overhead_items: newItems });
                      }}
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSettings({
                      ...settings,
                      fixed_overhead_items: [...settings.fixed_overhead_items, { name: '', monthly: 0 }],
                    });
                  }}
                >
                  + Add Item
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
