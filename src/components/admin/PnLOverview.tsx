import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { useToast } from '@/hooks/use-toast';
import { BookingWithDetails } from '@/hooks/useBookings';
import { Save, TrendingUp, TrendingDown, Target, DollarSign, Calculator, Plus, Trash2, Calendar } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { startOfYear, endOfYear, getMonth, getYear, startOfMonth, endOfMonth } from 'date-fns';
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

interface MonthlyOverheadItem {
  name: string;
  monthly: number[];  // Array of 12 values, one per month
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
  monthly_marketing_budget: number[];  // Changed from percent to monthly amounts
  google_lsa_spend: number[];
  facebook_ads_spend: number[];
  other_online_spend: number[];
  local_marketing_spend: number[];
  direct_mail_spend: number[];
  credit_card_percent: number;
  refunds_percent: number;
  fixed_overhead_items: MonthlyOverheadItem[];
  variable_overhead_items: MonthlyOverheadItem[];
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
  monthly_marketing_budget: Array(12).fill(0),
  google_lsa_spend: Array(12).fill(0),
  facebook_ads_spend: Array(12).fill(0),
  other_online_spend: Array(12).fill(0),
  local_marketing_spend: Array(12).fill(0),
  direct_mail_spend: Array(12).fill(0),
  credit_card_percent: 2.9,
  refunds_percent: 2,
  fixed_overhead_items: [
    { name: 'Booking Software', monthly: Array(12).fill(57) },
    { name: 'Insurance', monthly: Array(12).fill(62) },
    { name: 'Website Hosting', monthly: Array(12).fill(15) },
    { name: 'Phone/VoIP', monthly: Array(12).fill(35) },
    { name: 'Accounting Software', monthly: Array(12).fill(38) },
  ],
  variable_overhead_items: [
    { name: 'Supplies', monthly: Array(12).fill(0) },
    { name: 'Gas/Mileage', monthly: Array(12).fill(0) },
  ],
  recruiting_costs: Array(12).fill(0),
};

// Helper to migrate old format to new format
const migrateOverheadItems = (items: any[]): MonthlyOverheadItem[] => {
  if (!Array.isArray(items)) return [];
  return items.map(item => {
    if (Array.isArray(item.monthly)) {
      return item as MonthlyOverheadItem;
    }
    // Old format with single monthly value
    return {
      name: item.name || '',
      monthly: Array(12).fill(item.monthly || 0)
    };
  });
};

export function PnLOverview({ bookings, customers }: PnLOverviewProps) {
  const orgId = useOrgId();
  const { toast } = useToast();
  const [settings, setSettings] = useState<PnLSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('revenue-map');
  const [selectedOverheadMonth, setSelectedOverheadMonth] = useState(new Date().getMonth());
  const [summaryPeriod, setSummaryPeriod] = useState<'month' | 'year'>('year');
  const [selectedSummaryMonth, setSelectedSummaryMonth] = useState(new Date().getMonth());
  const [netProfitPeriod, setNetProfitPeriod] = useState<'ytd' | 'qtd' | 'mtd' | '1y' | '4w' | '1w'>('ytd');

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
        // Calculate monthly marketing budget from percentage if not stored separately
        let monthlyMarketingBudget = defaultSettings.monthly_marketing_budget;
        if (data.marketing_percent_of_revenue && data.annual_revenue_goal) {
          const monthlyBudget = (Number(data.annual_revenue_goal) * Number(data.marketing_percent_of_revenue) / 100) / 12;
          monthlyMarketingBudget = Array(12).fill(Math.round(monthlyBudget));
        }

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
          credit_card_percent: Number(data.credit_card_percent) || 2.9,
          refunds_percent: Number(data.refunds_percent) || 2,
          monthly_sales_goals: Array.isArray(data.monthly_sales_goals) ? (data.monthly_sales_goals as number[]) : defaultSettings.monthly_sales_goals,
          monthly_inbound_leads_goals: Array.isArray(data.monthly_inbound_leads_goals) ? (data.monthly_inbound_leads_goals as number[]) : defaultSettings.monthly_inbound_leads_goals,
          monthly_marketing_budget: monthlyMarketingBudget,
          google_lsa_spend: Array.isArray(data.google_lsa_spend) ? (data.google_lsa_spend as number[]) : defaultSettings.google_lsa_spend,
          facebook_ads_spend: Array.isArray(data.facebook_ads_spend) ? (data.facebook_ads_spend as number[]) : defaultSettings.facebook_ads_spend,
          other_online_spend: Array.isArray(data.other_online_spend) ? (data.other_online_spend as number[]) : defaultSettings.other_online_spend,
          local_marketing_spend: Array.isArray(data.local_marketing_spend) ? (data.local_marketing_spend as number[]) : defaultSettings.local_marketing_spend,
          direct_mail_spend: Array.isArray(data.direct_mail_spend) ? (data.direct_mail_spend as number[]) : defaultSettings.direct_mail_spend,
          fixed_overhead_items: migrateOverheadItems(data.fixed_overhead_items as any[]),
          variable_overhead_items: migrateOverheadItems(data.variable_overhead_items as any[]),
          recruiting_costs: Array.isArray(data.recruiting_costs) ? (data.recruiting_costs as number[]) : defaultSettings.recruiting_costs,
        });
      }
      setLoading(false);
    };
    
    fetchSettings();
  }, [organizationId, currentYear]);

  // Calculate actuals from bookings - use address-based first-time vs recurring detection
  const actuals = useMemo(() => {
    const yearStart = startOfYear(new Date(currentYear, 0, 1));
    const yearEnd = endOfYear(new Date(currentYear, 0, 1));
    
    const yearBookings = bookings.filter(b => {
      const date = new Date(b.scheduled_at);
      return date >= yearStart && date <= yearEnd && b.status !== 'cancelled';
    });
    
    // Monthly data
    const monthlyRevenue = Array(12).fill(0);
    const monthlyJobCount = Array(12).fill(0);
    const monthlyFirstTimeRevenue = Array(12).fill(0);
    const monthlyRecurringRevenue = Array(12).fill(0);
    const monthlyFirstTimeCustomers = Array(12).fill(0);
    const monthlyRepeatCustomers = Array(12).fill(0);
    const monthlyLaborCost = Array(12).fill(0);
    
    // Track address occurrences per month for first-time vs recurring detection
    const addressCountByMonth: Record<number, Record<string, number>> = {};
    MONTHS.forEach((_, i) => { addressCountByMonth[i] = {}; });
    
    // First pass: count address occurrences per month
    yearBookings.forEach(b => {
      if (b.status === 'completed') {
        const month = getMonth(new Date(b.scheduled_at));
        const address = (b.address || '').toLowerCase().trim();
        if (address) {
          addressCountByMonth[month][address] = (addressCountByMonth[month][address] || 0) + 1;
        }
      }
    });
    
    // Track unique addresses seen all time before each month for true first-time detection
    const allTimeAddresses = new Set<string>();
    const addressFirstSeenMonth: Record<string, number> = {};
    
    // Sort bookings by date to track when addresses were first seen
    const sortedBookings = [...yearBookings].sort((a, b) => 
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );
    
    sortedBookings.forEach(b => {
      if (b.status === 'completed') {
        const month = getMonth(new Date(b.scheduled_at));
        const address = (b.address || '').toLowerCase().trim();
        if (address && !(address in addressFirstSeenMonth)) {
          addressFirstSeenMonth[address] = month;
        }
      }
    });
    
    // Second pass: calculate revenue and labor costs
    yearBookings.forEach(b => {
      if (b.status === 'completed') {
        const month = getMonth(new Date(b.scheduled_at));
        const amount = Number(b.total_amount || 0);
        monthlyRevenue[month] += amount;
        monthlyJobCount[month] += 1;
        
        // Calculate actual labor cost from booking
        const bookingData = b as any;
        const laborCost = Number(bookingData.cleaner_actual_payment || bookingData.cleaner_wage || 0);
        monthlyLaborCost[month] += laborCost;
        
        // Determine first-time vs recurring based on address
        const address = (b.address || '').toLowerCase().trim();
        if (address) {
          const firstSeenMonth = addressFirstSeenMonth[address];
          const addressCountThisMonth = addressCountByMonth[month][address] || 0;
          
          // First-time: this is the first month we've seen this address
          // Recurring: address has appeared in a previous month OR appears multiple times this month
          if (firstSeenMonth === month && addressCountThisMonth === 1) {
            monthlyFirstTimeRevenue[month] += amount;
            monthlyFirstTimeCustomers[month] += 1;
          } else {
            monthlyRecurringRevenue[month] += amount;
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
    const totalFirstTimeRevenue = monthlyFirstTimeRevenue.reduce((a, b) => a + b, 0);
    const totalRecurringRevenue = monthlyRecurringRevenue.reduce((a, b) => a + b, 0);
    const totalLaborCost = monthlyLaborCost.reduce((a, b) => a + b, 0);
    
    // Calculate customer retention rate
    const uniqueAddresses = new Set(yearBookings.filter(b => b.address).map(b => (b.address || '').toLowerCase().trim()));
    const recurringAddresses = new Set<string>();
    Object.entries(addressFirstSeenMonth).forEach(([addr, firstMonth]) => {
      // Check if this address appears in any month after first seen
      for (let m = firstMonth + 1; m < 12; m++) {
        if (addressCountByMonth[m][addr] > 0) {
          recurringAddresses.add(addr);
          break;
        }
      }
    });
    const retentionRate = uniqueAddresses.size > 0 ? (recurringAddresses.size / uniqueAddresses.size) * 100 : 0;
    
    return {
      monthlyRevenue,
      monthlyJobCount,
      monthlyFirstTimeCustomers,
      monthlyRepeatCustomers,
      monthlyFirstTimeRevenue,
      monthlyRecurringRevenue,
      monthlyLaborCost,
      totalRevenue,
      totalJobs,
      avgJobSize,
      totalFirstTime,
      totalRepeat,
      totalFirstTimeRevenue,
      totalRecurringRevenue,
      totalLaborCost,
      repeatRevenuePercent: totalRevenue > 0 ? (totalRecurringRevenue / totalRevenue) * 100 : 0,
      retentionRate,
      uniqueCustomers: uniqueAddresses.size,
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
      // Store monthly budget in a field that exists - use marketing_percent_of_revenue temporarily
      // or we store it as JSON in an existing field
      google_lsa_spend: settings.google_lsa_spend,
      facebook_ads_spend: settings.facebook_ads_spend,
      other_online_spend: settings.other_online_spend,
      local_marketing_spend: settings.local_marketing_spend,
      direct_mail_spend: settings.direct_mail_spend,
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

  const updateMonthlyMarketingBudget = (index: number, value: number) => {
    const newBudget = [...settings.monthly_marketing_budget];
    newBudget[index] = value;
    setSettings({ ...settings, monthly_marketing_budget: newBudget });
  };

  const addOverheadItem = (type: 'fixed' | 'variable') => {
    const key = type === 'fixed' ? 'fixed_overhead_items' : 'variable_overhead_items';
    setSettings({
      ...settings,
      [key]: [...settings[key], { name: '', monthly: Array(12).fill(0) }],
    });
  };

  const removeOverheadItem = (type: 'fixed' | 'variable', index: number) => {
    const key = type === 'fixed' ? 'fixed_overhead_items' : 'variable_overhead_items';
    const newItems = settings[key].filter((_, i) => i !== index);
    setSettings({ ...settings, [key]: newItems });
  };

  const updateOverheadItem = (type: 'fixed' | 'variable', index: number, field: 'name' | 'monthly', value: string | number, monthIndex?: number) => {
    const key = type === 'fixed' ? 'fixed_overhead_items' : 'variable_overhead_items';
    const newItems = [...settings[key]];
    if (field === 'name') {
      newItems[index] = { ...newItems[index], name: value as string };
    } else if (field === 'monthly' && monthIndex !== undefined) {
      const newMonthly = [...newItems[index].monthly];
      newMonthly[monthIndex] = value as number;
      newItems[index] = { ...newItems[index], monthly: newMonthly };
    }
    setSettings({ ...settings, [key]: newItems });
  };

  // Calculate derived values
  const totalSalesGoal = settings.monthly_sales_goals.reduce((a, b) => a + b, 0);
  const totalMarketingBudget = settings.monthly_marketing_budget.reduce((a, b) => a + b, 0);
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

  // P&L Calculations - using actual labor costs from payroll
  const pnlData = useMemo(() => {
    return MONTHS.map((month, i) => {
      const revenue = actuals.monthlyRevenue[i];
      const projectedRevenue = settings.monthly_sales_goals[i] || 0;
      
      // COGS - use actual labor costs from bookings
      const laborCost = actuals.monthlyLaborCost[i];
      const ccProcessing = revenue * (settings.credit_card_percent / 100);
      const refunds = revenue * (settings.refunds_percent / 100);
      const totalCOGS = laborCost + ccProcessing + refunds;
      const grossProfit = revenue - totalCOGS;
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
      
      // Fixed Overhead - now per month
      const fixedOverhead = settings.fixed_overhead_items.reduce((sum, item) => sum + (item.monthly[i] || 0), 0);
      
      // Variable Overhead - now per month
      const variableOverhead = settings.variable_overhead_items.reduce((sum, item) => sum + (item.monthly[i] || 0), 0);
      
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
        laborCost,
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
      laborCost: acc.laborCost + month.laborCost,
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
      revenue: 0, projectedRevenue: 0, laborCost: 0, ccProcessing: 0, refunds: 0,
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

  // Helper for input values - show empty string instead of 0
  const inputValue = (val: number) => val === 0 ? '' : val;
  const parseInputValue = (val: string) => val === '' ? 0 : Number(val);

  // Calculate summary data based on selected period (month or year)
  const summaryData = useMemo(() => {
    if (summaryPeriod === 'month') {
      const monthData = pnlData[selectedSummaryMonth];
      return {
        revenue: monthData.revenue,
        firstTimeRevenue: actuals.monthlyFirstTimeRevenue[selectedSummaryMonth],
        recurringRevenue: actuals.monthlyRecurringRevenue[selectedSummaryMonth],
        laborCost: monthData.laborCost,
        marketingSpend: monthData.marketing,
        fixedCosts: monthData.fixedOverhead,
        variableCosts: monthData.variableOverhead,
        netProfit: monthData.netProfit,
        grossProfit: monthData.grossProfit,
        repeatRevenuePercent: monthData.revenue > 0 ? (actuals.monthlyRecurringRevenue[selectedSummaryMonth] / monthData.revenue) * 100 : 0,
        periodLabel: MONTHS[selectedSummaryMonth],
        revenueGoal: settings.monthly_sales_goals[selectedSummaryMonth] || 0,
        marketingBudget: settings.monthly_marketing_budget[selectedSummaryMonth] || 0,
      };
    }
    return {
      revenue: pnlTotals.revenue,
      firstTimeRevenue: actuals.totalFirstTimeRevenue,
      recurringRevenue: actuals.totalRecurringRevenue,
      laborCost: pnlTotals.laborCost,
      marketingSpend: pnlTotals.marketing,
      fixedCosts: pnlTotals.fixedOverhead,
      variableCosts: pnlTotals.variableOverhead,
      netProfit: pnlTotals.netProfit,
      grossProfit: pnlTotals.grossProfit,
      repeatRevenuePercent: actuals.repeatRevenuePercent,
      periodLabel: 'YTD',
      revenueGoal: settings.annual_revenue_goal,
      marketingBudget: totalMarketingBudget,
    };
  }, [summaryPeriod, selectedSummaryMonth, pnlData, pnlTotals, actuals, settings, totalMarketingBudget]);

  // Calculate Net Profit based on selected time period
  const netProfitByPeriod = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentDate = now.getDate();
    
    // YTD - sum of all months up to current
    const ytd = pnlData.slice(0, currentMonth + 1).reduce((sum, m) => sum + m.netProfit, 0);
    
    // QTD - current quarter
    const quarterStart = Math.floor(currentMonth / 3) * 3;
    const qtd = pnlData.slice(quarterStart, currentMonth + 1).reduce((sum, m) => sum + m.netProfit, 0);
    
    // MTD - current month
    const mtd = pnlData[currentMonth]?.netProfit || 0;
    
    // 1Y - full year (same as YTD for current year)
    const oneYear = pnlTotals.netProfit;
    
    // 4W - last 4 weeks (approximate with current month)
    const fourWeeks = mtd;
    
    // 1W - last week (approximate with current month / 4)
    const oneWeek = mtd / 4;
    
    return { ytd, qtd, mtd, '1y': oneYear, '4w': fourWeeks, '1w': oneWeek };
  }, [pnlData, pnlTotals]);

  const currentNetProfit = netProfitByPeriod[netProfitPeriod];
  const currentNetProfitRevenue = netProfitPeriod === 'mtd' ? pnlData[new Date().getMonth()]?.revenue || 0 :
    netProfitPeriod === 'qtd' ? pnlData.slice(Math.floor(new Date().getMonth() / 3) * 3, new Date().getMonth() + 1).reduce((sum, m) => sum + m.revenue, 0) :
    pnlTotals.revenue;
  const currentNetProfitMargin = currentNetProfitRevenue > 0 ? (currentNetProfit / currentNetProfitRevenue) * 100 : 0;

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
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Net Profit</p>
              {currentNetProfit >= 0 ? (
                <TrendingUp className="w-6 h-6 text-success opacity-50" />
              ) : (
                <TrendingDown className="w-6 h-6 text-destructive opacity-50" />
              )}
            </div>
            <p className={`text-2xl font-bold ${currentNetProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
              ${currentNetProfit.toLocaleString()}
            </p>
            <ToggleGroup type="single" value={netProfitPeriod} onValueChange={(v) => v && setNetProfitPeriod(v as typeof netProfitPeriod)} className="mt-2 flex flex-wrap justify-start gap-1">
              <ToggleGroupItem value="ytd" size="sm" className="text-xs px-2 py-1 h-6">YTD</ToggleGroupItem>
              <ToggleGroupItem value="qtd" size="sm" className="text-xs px-2 py-1 h-6">QTD</ToggleGroupItem>
              <ToggleGroupItem value="mtd" size="sm" className="text-xs px-2 py-1 h-6">MTD</ToggleGroupItem>
              <ToggleGroupItem value="1y" size="sm" className="text-xs px-2 py-1 h-6">1Y</ToggleGroupItem>
              <ToggleGroupItem value="4w" size="sm" className="text-xs px-2 py-1 h-6">4W</ToggleGroupItem>
              <ToggleGroupItem value="1w" size="sm" className="text-xs px-2 py-1 h-6">1W</ToggleGroupItem>
            </ToggleGroup>
            <div className="mt-2">
              <Badge variant={currentNetProfitMargin >= 20 ? 'default' : 'secondary'}>
                {currentNetProfitMargin.toFixed(1)}% margin
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">P&L Summary at a Glance</CardTitle>
          <div className="flex items-center gap-2">
            <ToggleGroup type="single" value={summaryPeriod} onValueChange={(v) => v && setSummaryPeriod(v as 'month' | 'year')} className="gap-1">
              <ToggleGroupItem value="month" size="sm" className="text-xs px-3 h-8">Month</ToggleGroupItem>
              <ToggleGroupItem value="year" size="sm" className="text-xs px-3 h-8">Year</ToggleGroupItem>
            </ToggleGroup>
            {summaryPeriod === 'month' && (
              <Select value={String(selectedSummaryMonth)} onValueChange={(v) => setSelectedSummaryMonth(Number(v))}>
                <SelectTrigger className="w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Showing data for: <strong>{summaryData.periodLabel} {currentYear}</strong>
          </p>
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
                <TableCell className="text-right">${summaryData.revenue.toLocaleString()}</TableCell>
                <TableCell className="text-right">${summaryData.revenueGoal.toLocaleString()}</TableCell>
                <TableCell className="text-center">
                  <Badge className={statusColors[getStatus(summaryData.revenue, summaryData.revenueGoal)]}>
                    {statusIcons[getStatus(summaryData.revenue, summaryData.revenueGoal)]} {getStatus(summaryData.revenue, summaryData.revenueGoal) === 'behind' ? 'Behind' : 'On Track'}
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium pl-6 text-muted-foreground">→ First-Time Revenue</TableCell>
                <TableCell className="text-right">${summaryData.firstTimeRevenue.toLocaleString()}</TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="text-center text-muted-foreground">—</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium pl-6 text-muted-foreground">→ Recurring Revenue</TableCell>
                <TableCell className="text-right">${summaryData.recurringRevenue.toLocaleString()}</TableCell>
                <TableCell className="text-right">{settings.goal_repeat_revenue_percent}% of total</TableCell>
                <TableCell className="text-center">
                  <Badge className={statusColors[getStatus(summaryData.repeatRevenuePercent, settings.goal_repeat_revenue_percent)]}>
                    {statusIcons[getStatus(summaryData.repeatRevenuePercent, settings.goal_repeat_revenue_percent)]} {summaryData.repeatRevenuePercent.toFixed(0)}%
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Field Labor (Payroll)</TableCell>
                <TableCell className="text-right text-destructive">-${summaryData.laborCost.toLocaleString()}</TableCell>
                <TableCell className="text-right text-muted-foreground">From Payroll</TableCell>
                <TableCell className="text-center text-muted-foreground">—</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Marketing Spend</TableCell>
                <TableCell className="text-right text-destructive">-${summaryData.marketingSpend.toLocaleString()}</TableCell>
                <TableCell className="text-right">-${summaryData.marketingBudget.toLocaleString()}</TableCell>
                <TableCell className="text-center">
                  <Badge className={statusColors[getStatus(summaryData.marketingBudget, summaryData.marketingSpend, false)]}>
                    {statusIcons[getStatus(summaryData.marketingBudget, summaryData.marketingSpend, false)]} {summaryData.marketingSpend <= summaryData.marketingBudget ? 'Under Budget' : 'Over Budget'}
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Fixed Costs ({summaryData.periodLabel})</TableCell>
                <TableCell className="text-right text-destructive">-${summaryData.fixedCosts.toLocaleString()}</TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
                <TableCell className="text-center text-muted-foreground">—</TableCell>
              </TableRow>
              <TableRow className="bg-muted/50 border-t-2">
                <TableCell className="font-bold">Net Profit ({summaryData.periodLabel})</TableCell>
                <TableCell className={`text-right font-bold ${summaryData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${summaryData.netProfit.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-medium">
                  ${(summaryData.revenueGoal * 0.2).toLocaleString()} (20% goal)
                </TableCell>
                <TableCell className="text-center">
                  <Badge className={statusColors[summaryData.revenue > 0 && (summaryData.netProfit / summaryData.revenue) * 100 >= 20 ? 'ahead' : summaryData.revenue > 0 && (summaryData.netProfit / summaryData.revenue) * 100 >= 10 ? 'at-risk' : 'behind']}>
                    {summaryData.revenue > 0 && (summaryData.netProfit / summaryData.revenue) * 100 >= 20 ? '✅' : '⚠️'} {summaryData.revenue > 0 ? ((summaryData.netProfit / summaryData.revenue) * 100).toFixed(1) : 0}% margin
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
                      value={inputValue(settings.annual_revenue_goal)}
                      onChange={(e) => setSettings({ ...settings, annual_revenue_goal: parseInputValue(e.target.value) })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>Last Year Revenue ($)</Label>
                    <Input
                      type="number"
                      value={inputValue(settings.last_year_revenue)}
                      onChange={(e) => setSettings({ ...settings, last_year_revenue: parseInputValue(e.target.value) })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>Avg Job Size Goal ($)</Label>
                    <Input
                      type="number"
                      value={inputValue(settings.avg_job_size_goal)}
                      onChange={(e) => setSettings({ ...settings, avg_job_size_goal: parseInputValue(e.target.value) })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>Closing Rate Goal (%)</Label>
                    <Input
                      type="number"
                      value={inputValue(settings.closing_rate_goal)}
                      onChange={(e) => setSettings({ ...settings, closing_rate_goal: parseInputValue(e.target.value) })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>Repeat Revenue Goal (%)</Label>
                    <Input
                      type="number"
                      value={inputValue(settings.goal_repeat_revenue_percent)}
                      onChange={(e) => setSettings({ ...settings, goal_repeat_revenue_percent: parseInputValue(e.target.value) })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>1st Time → Recurring (%)</Label>
                    <Input
                      type="number"
                      value={inputValue(settings.first_time_to_recurring_goal)}
                      onChange={(e) => setSettings({ ...settings, first_time_to_recurring_goal: parseInputValue(e.target.value) })}
                      placeholder="0"
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
                    <p className="text-sm text-muted-foreground">YTD Revenue</p>
                    <p className="text-xl font-bold">${actuals.totalRevenue.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Jobs</p>
                    <p className="text-xl font-bold">{actuals.totalJobs}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Avg Job Size</p>
                    <p className="text-xl font-bold">${actuals.avgJobSize.toFixed(0)}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Repeat Revenue %</p>
                    <p className="text-xl font-bold">{actuals.repeatRevenuePercent.toFixed(1)}%</p>
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">First-Time Clients</p>
                  <p className="text-2xl font-bold">{actuals.totalFirstTime}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">First-Time Revenue</p>
                  <p className="text-2xl font-bold">${actuals.totalFirstTimeRevenue.toLocaleString()}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Recurring Clients</p>
                  <p className="text-2xl font-bold">{actuals.totalRepeat}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Recurring Revenue</p>
                  <p className="text-2xl font-bold">${actuals.totalRecurringRevenue.toLocaleString()}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                * First-time = unique address appearing once in a month. Recurring = same address appearing multiple times or in previous months.
              </p>
            </CardContent>
          </Card>

          {/* Bookings Calculator */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bookings Required Calculator</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Bookings/Year Needed</p>
                  <p className="text-3xl font-bold">
                    {settings.avg_job_size_goal > 0 ? Math.ceil(settings.annual_revenue_goal / settings.avg_job_size_goal) : 0}
                  </p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Bookings/Month Needed</p>
                  <p className="text-3xl font-bold">
                    {settings.avg_job_size_goal > 0 ? Math.ceil(settings.annual_revenue_goal / settings.avg_job_size_goal / 12) : 0}
                  </p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Leads/Month Needed</p>
                  <p className="text-3xl font-bold">
                    {settings.avg_job_size_goal > 0 && settings.closing_rate_goal > 0 
                      ? Math.ceil((settings.annual_revenue_goal / settings.avg_job_size_goal / 12) / (settings.closing_rate_goal / 100)) 
                      : 0}
                  </p>
                  <p className="text-xs text-muted-foreground">@ {settings.closing_rate_goal}% close rate</p>
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
                              value={inputValue(goal)}
                              onChange={(e) => updateMonthlyGoal(i, parseInputValue(e.target.value))}
                              className="w-24 text-right ml-auto"
                              placeholder="0"
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
                <p className="text-xs text-muted-foreground">Sum of monthly budgets</p>
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
                  <Label>Closing Rate Goal (%)</Label>
                  <Input
                    type="number"
                    value={inputValue(settings.closing_rate_goal)}
                    onChange={(e) => setSettings({ ...settings, closing_rate_goal: parseInputValue(e.target.value) })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Lead Count Goal (Annual)</Label>
                  <p className="text-lg font-medium">{totalLeadsGoal}</p>
                  <p className="text-xs text-muted-foreground">Sum of monthly lead goals below</p>
                </div>
                <div>
                  <Label>Expected New Customers</Label>
                  <p className="text-lg font-medium">{Math.round(totalLeadsGoal * settings.closing_rate_goal / 100)}</p>
                  <p className="text-xs text-muted-foreground">@ {settings.closing_rate_goal}% close rate</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Marketing Budget */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monthly Marketing Budget</CardTitle>
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
                      <TableCell className="font-medium">Budget ($)</TableCell>
                      {MONTHS.map((_, i) => (
                        <TableCell key={i} className="p-1">
                          <Input
                            type="number"
                            value={inputValue(settings.monthly_marketing_budget[i])}
                            onChange={(e) => updateMonthlyMarketingBudget(i, parseInputValue(e.target.value))}
                            className="w-16 text-xs text-right"
                            placeholder="0"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-bold">${totalMarketingBudget.toLocaleString()}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
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
                            value={inputValue(settings.monthly_inbound_leads_goals[i])}
                            onChange={(e) => updateMonthlyLeads(i, parseInputValue(e.target.value))}
                            className="w-16 text-xs text-right"
                            placeholder="0"
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
                              value={inputValue((settings[key as keyof PnLSettings] as number[])[i])}
                              onChange={(e) => updateMarketingSpend(key as keyof PnLSettings, i, parseInputValue(e.target.value))}
                              className="w-16 text-xs text-right"
                              placeholder="0"
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
                <div className="p-4 bg-muted rounded-lg">
                  <Label className="text-sm text-muted-foreground">Field Labor (from Payroll)</Label>
                  <p className="text-2xl font-bold">${actuals.totalLaborCost.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Pulled from completed booking payments</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>CC Processing %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={inputValue(settings.credit_card_percent)}
                      onChange={(e) => setSettings({ ...settings, credit_card_percent: parseInputValue(e.target.value) })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label>Refunds %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={inputValue(settings.refunds_percent)}
                      onChange={(e) => setSettings({ ...settings, refunds_percent: parseInputValue(e.target.value) })}
                      placeholder="0"
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

          {/* Overhead Items with Month Selector */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Fixed Overhead (Monthly)</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={String(selectedOverheadMonth)} onValueChange={(v) => setSelectedOverheadMonth(Number(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => addOverheadItem('fixed')}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">Editing costs for: <strong>{MONTHS[selectedOverheadMonth]}</strong></p>
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
                    value={inputValue(item.monthly[selectedOverheadMonth] || 0)}
                    onChange={(e) => updateOverheadItem('fixed', i, 'monthly', parseInputValue(e.target.value), selectedOverheadMonth)}
                    className="w-24"
                    placeholder="0"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeOverheadItem('fixed', i)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <div className="pt-2 border-t">
                <p className="text-sm font-medium">
                  {MONTHS[selectedOverheadMonth]} Total: ${settings.fixed_overhead_items.reduce((sum, item) => sum + (item.monthly[selectedOverheadMonth] || 0), 0).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  YTD Total: ${settings.fixed_overhead_items.reduce((sum, item) => sum + item.monthly.reduce((a, b) => a + b, 0), 0).toLocaleString()}
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
              <p className="text-xs text-muted-foreground mb-2">Editing costs for: <strong>{MONTHS[selectedOverheadMonth]}</strong></p>
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
                    value={inputValue(item.monthly[selectedOverheadMonth] || 0)}
                    onChange={(e) => updateOverheadItem('variable', i, 'monthly', parseInputValue(e.target.value), selectedOverheadMonth)}
                    className="w-24"
                    placeholder="0"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeOverheadItem('variable', i)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <div className="pt-2 border-t">
                <p className="text-sm font-medium">
                  {MONTHS[selectedOverheadMonth]} Total: ${settings.variable_overhead_items.reduce((sum, item) => sum + (item.monthly[selectedOverheadMonth] || 0), 0).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>

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
                      <TableCell className="pl-4 text-muted-foreground">Field Labor (Payroll)</TableCell>
                      {pnlData.map((d, i) => <TableCell key={i} className="text-right text-xs text-destructive">-${d.laborCost.toFixed(0)}</TableCell>)}
                      <TableCell className="text-right text-destructive">-${pnlTotals.laborCost.toLocaleString()}</TableCell>
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
