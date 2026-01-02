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
import { Save, TrendingUp, TrendingDown, Target, DollarSign, Calculator, Plus, Trash2, Calendar, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
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

interface MarketingChannel {
  id: string;
  name: string;
  monthly: number[];
}

interface PnLSettings {
  id?: string;
  year: number;
  annual_revenue_goal: number;
  last_year_revenue: number;
  goal_repeat_revenue_percent: number;
  goal_repeat_revenue_amount: number;  // Dollar amount goal for recurring revenue
  goal_first_time_revenue_amount: number;  // Dollar amount goal for first-time revenue
  fixed_cost_goal: number;  // Goal for max fixed costs
  net_profit_goal_percent: number;  // Editable net profit margin goal (e.g., 20%)
  monthly_first_time_goals: number[];  // Monthly goals for first-time revenue
  monthly_recurring_goals: number[];  // Monthly goals for recurring revenue
  monthly_fixed_cost_goals: number[];  // Monthly goals for fixed costs
  avg_job_size_goal: number;
  closing_rate_goal: number;
  first_time_to_recurring_goal: number;
  churn_rate_goal: number;
  monthly_sales_goals: number[];
  monthly_inbound_leads_goals: number[];
  monthly_marketing_budget: number[];
  marketing_channels: MarketingChannel[];  // Dynamic marketing channels
  // Legacy fields for backwards compatibility
  google_lsa_spend: number[];
  facebook_ads_spend: number[];
  other_online_spend: number[];
  local_marketing_spend: number[];
  direct_mail_spend: number[];
  marketing_channel_names: { [key: string]: string };
  credit_card_percent: number;
  refunds_percent: number;
  fixed_overhead_items: MonthlyOverheadItem[];
  variable_overhead_items: MonthlyOverheadItem[];
  recruiting_costs: number[];
  // Manual CPL/CPA inputs
  target_cpl: number;
  target_cpa: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const defaultSettings: PnLSettings = {
  year: new Date().getFullYear(),
  annual_revenue_goal: 0,
  last_year_revenue: 0,
  goal_repeat_revenue_percent: 50,
  goal_repeat_revenue_amount: 0,
  goal_first_time_revenue_amount: 0,
  fixed_cost_goal: 0,
  net_profit_goal_percent: 20,  // Default 20% profit margin goal
  monthly_first_time_goals: Array(12).fill(0),
  monthly_recurring_goals: Array(12).fill(0),
  monthly_fixed_cost_goals: Array(12).fill(0),
  avg_job_size_goal: 250,
  closing_rate_goal: 50,
  first_time_to_recurring_goal: 30,
  churn_rate_goal: 3,
  monthly_sales_goals: Array(12).fill(0),
  monthly_inbound_leads_goals: Array(12).fill(0),
  monthly_marketing_budget: Array(12).fill(0),
  marketing_channels: [
    { id: 'google_lsa', name: 'Google LSA', monthly: Array(12).fill(0) },
    { id: 'facebook_ads', name: 'Facebook Ads', monthly: Array(12).fill(0) },
    { id: 'other_online', name: 'Other Online', monthly: Array(12).fill(0) },
    { id: 'local_marketing', name: 'Local Marketing', monthly: Array(12).fill(0) },
    { id: 'direct_mail', name: 'Direct Mail', monthly: Array(12).fill(0) },
  ],
  google_lsa_spend: Array(12).fill(0),
  facebook_ads_spend: Array(12).fill(0),
  other_online_spend: Array(12).fill(0),
  local_marketing_spend: Array(12).fill(0),
  direct_mail_spend: Array(12).fill(0),
  marketing_channel_names: {
    google_lsa_spend: 'Google LSA',
    facebook_ads_spend: 'Facebook Ads',
    other_online_spend: 'Other Online',
    local_marketing_spend: 'Local Marketing',
    direct_mail_spend: 'Direct Mail',
  },
  credit_card_percent: 2.9,
  refunds_percent: 2,
  fixed_overhead_items: [
    { name: 'Booking Software', monthly: Array(12).fill(0) },
    { name: 'Insurance', monthly: Array(12).fill(0) },
    { name: 'Website Hosting', monthly: Array(12).fill(0) },
    { name: 'Phone/VoIP', monthly: Array(12).fill(0) },
    { name: 'Accounting Software', monthly: Array(12).fill(0) },
  ],
  variable_overhead_items: [
    { name: 'Supplies', monthly: Array(12).fill(0) },
    { name: 'Gas/Mileage', monthly: Array(12).fill(0) },
  ],
  recruiting_costs: Array(12).fill(0),
  target_cpl: 0,
  target_cpa: 0,
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

// Helper to migrate legacy marketing spend to new channels format
const migrateMarketingChannels = (data: any, channelNames: { [key: string]: string }): MarketingChannel[] => {
  const legacyKeys = ['google_lsa_spend', 'facebook_ads_spend', 'other_online_spend', 'local_marketing_spend', 'direct_mail_spend'];
  const defaultNames: { [key: string]: string } = {
    google_lsa_spend: 'Google LSA',
    facebook_ads_spend: 'Facebook Ads',
    other_online_spend: 'Other Online',
    local_marketing_spend: 'Local Marketing',
    direct_mail_spend: 'Direct Mail',
  };
  
  return legacyKeys.map(key => ({
    id: key.replace('_spend', ''),
    name: channelNames?.[key] || defaultNames[key] || key,
    monthly: Array.isArray(data[key]) ? (data[key] as number[]) : Array(12).fill(0),
  }));
};

export function PnLOverview({ bookings, customers }: PnLOverviewProps) {
  const orgId = useOrgId();
  const { toast } = useToast();
  const [settings, setSettings] = useState<PnLSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('revenue-map');
  const [selectedOverheadMonth, setSelectedOverheadMonth] = useState(new Date().getMonth());
  const [selectedMarketingMonth, setSelectedMarketingMonth] = useState(new Date().getMonth());
  const [summaryPeriod, setSummaryPeriod] = useState<'month' | 'year'>('year');
  const [selectedSummaryMonth, setSelectedSummaryMonth] = useState(new Date().getMonth());
  const [netProfitPeriod, setNetProfitPeriod] = useState<'ytd' | 'qtd' | 'mtd' | '1y' | '4w' | '1w'>('ytd');

  // Expense category to overhead mapping
  const EXPENSE_CATEGORY_MAP: Record<string, { type: 'fixed' | 'variable'; name: string }> = {
    'insurance': { type: 'fixed', name: 'Insurance' },
    'domain': { type: 'fixed', name: 'Website Hosting' },
    'dialers': { type: 'fixed', name: 'Phone/VoIP' },
    'office': { type: 'fixed', name: 'Office/Admin' },
    'supplies': { type: 'variable', name: 'Supplies' },
    'mileage': { type: 'variable', name: 'Gas/Mileage' },
    'equipment': { type: 'variable', name: 'Equipment' },
    'misc': { type: 'variable', name: 'Misc' },
    'other': { type: 'variable', name: 'Other' },
  };

  // State for actual expenses from Expenses page
  const [actualExpenses, setActualExpenses] = useState<{
    byCategory: Record<string, number[]>;  // category -> monthly totals
    total: number[];  // monthly totals
  }>({ byCategory: {}, total: Array(12).fill(0) });

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
          goal_repeat_revenue_amount: Number((data as any).goal_repeat_revenue_amount) || 0,
          goal_first_time_revenue_amount: Number((data as any).goal_first_time_revenue_amount) || 0,
          fixed_cost_goal: Number((data as any).fixed_cost_goal) || 0,
          net_profit_goal_percent: Number((data as any).net_profit_goal_percent) || 20,
          monthly_first_time_goals: Array.isArray((data as any).monthly_first_time_goals) ? ((data as any).monthly_first_time_goals as number[]) : defaultSettings.monthly_first_time_goals,
          monthly_recurring_goals: Array.isArray((data as any).monthly_recurring_goals) ? ((data as any).monthly_recurring_goals as number[]) : defaultSettings.monthly_recurring_goals,
          monthly_fixed_cost_goals: Array.isArray((data as any).monthly_fixed_cost_goals) ? ((data as any).monthly_fixed_cost_goals as number[]) : defaultSettings.monthly_fixed_cost_goals,
          avg_job_size_goal: Number(data.avg_job_size_goal) || 250,
          closing_rate_goal: Number(data.closing_rate_goal) || 50,
          first_time_to_recurring_goal: Number(data.first_time_to_recurring_goal) || 30,
          churn_rate_goal: Number(data.churn_rate_goal) || 3,
          credit_card_percent: Number(data.credit_card_percent) || 2.9,
          refunds_percent: Number(data.refunds_percent) || 2,
          monthly_sales_goals: Array.isArray(data.monthly_sales_goals) ? (data.monthly_sales_goals as number[]) : defaultSettings.monthly_sales_goals,
          monthly_inbound_leads_goals: Array.isArray(data.monthly_inbound_leads_goals) ? (data.monthly_inbound_leads_goals as number[]) : defaultSettings.monthly_inbound_leads_goals,
          monthly_marketing_budget: monthlyMarketingBudget,
          marketing_channels: migrateMarketingChannels(data, (data as any).marketing_channel_names || {}),
          google_lsa_spend: Array.isArray(data.google_lsa_spend) ? (data.google_lsa_spend as number[]) : defaultSettings.google_lsa_spend,
          facebook_ads_spend: Array.isArray(data.facebook_ads_spend) ? (data.facebook_ads_spend as number[]) : defaultSettings.facebook_ads_spend,
          other_online_spend: Array.isArray(data.other_online_spend) ? (data.other_online_spend as number[]) : defaultSettings.other_online_spend,
          local_marketing_spend: Array.isArray(data.local_marketing_spend) ? (data.local_marketing_spend as number[]) : defaultSettings.local_marketing_spend,
          direct_mail_spend: Array.isArray(data.direct_mail_spend) ? (data.direct_mail_spend as number[]) : defaultSettings.direct_mail_spend,
          fixed_overhead_items: migrateOverheadItems(data.fixed_overhead_items as any[]),
          variable_overhead_items: migrateOverheadItems(data.variable_overhead_items as any[]),
          recruiting_costs: Array.isArray(data.recruiting_costs) ? (data.recruiting_costs as number[]) : defaultSettings.recruiting_costs,
          target_cpl: Number((data as any).target_cpl) || 0,
          target_cpa: Number((data as any).target_cpa) || 0,
        });
      }
      setLoading(false);
    };
    
    fetchSettings();
  }, [organizationId, currentYear]);

  // Fetch actual expenses from Expenses page
  useEffect(() => {
    const fetchExpenses = async () => {
      if (!organizationId) return;
      
      const yearStart = `${currentYear}-01-01`;
      const yearEnd = `${currentYear}-12-31`;
      
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('expense_date', yearStart)
        .lte('expense_date', yearEnd);
      
      if (data) {
        const byCategory: Record<string, number[]> = {};
        const total = Array(12).fill(0);
        
        data.forEach((expense: any) => {
          const month = getMonth(new Date(expense.expense_date));
          const amount = Number(expense.amount) || 0;
          const category = expense.category || 'other';
          
          if (!byCategory[category]) {
            byCategory[category] = Array(12).fill(0);
          }
          byCategory[category][month] += amount;
          total[month] += amount;
        });
        
        setActualExpenses({ byCategory, total });
      }
    };
    
    fetchExpenses();
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
    
    // Convert marketing_channels back to legacy format for database storage
    const channelData: Record<string, number[]> = {};
    const channelNames: Record<string, string> = {};
    settings.marketing_channels.forEach((ch, idx) => {
      const legacyKey = idx === 0 ? 'google_lsa_spend' :
                        idx === 1 ? 'facebook_ads_spend' :
                        idx === 2 ? 'other_online_spend' :
                        idx === 3 ? 'local_marketing_spend' :
                        idx === 4 ? 'direct_mail_spend' :
                        `custom_channel_${idx}`;
      channelData[legacyKey] = ch.monthly;
      channelNames[legacyKey] = ch.name;
    });

    const payload = {
      organization_id: organizationId,
      year: currentYear,
      annual_revenue_goal: settings.annual_revenue_goal,
      last_year_revenue: settings.last_year_revenue,
      goal_repeat_revenue_percent: settings.goal_repeat_revenue_percent,
      goal_repeat_revenue_amount: settings.goal_repeat_revenue_amount,
      goal_first_time_revenue_amount: settings.goal_first_time_revenue_amount,
      fixed_cost_goal: settings.fixed_cost_goal,
      net_profit_goal_percent: settings.net_profit_goal_percent,
      monthly_first_time_goals: settings.monthly_first_time_goals,
      monthly_recurring_goals: settings.monthly_recurring_goals,
      monthly_fixed_cost_goals: settings.monthly_fixed_cost_goals,
      target_cpl: settings.target_cpl,
      target_cpa: settings.target_cpa,
      avg_job_size_goal: settings.avg_job_size_goal,
      closing_rate_goal: settings.closing_rate_goal,
      first_time_to_recurring_goal: settings.first_time_to_recurring_goal,
      churn_rate_goal: settings.churn_rate_goal,
      monthly_sales_goals: settings.monthly_sales_goals,
      monthly_inbound_leads_goals: settings.monthly_inbound_leads_goals,
      google_lsa_spend: channelData['google_lsa_spend'] || settings.marketing_channels[0]?.monthly || Array(12).fill(0),
      facebook_ads_spend: channelData['facebook_ads_spend'] || settings.marketing_channels[1]?.monthly || Array(12).fill(0),
      other_online_spend: channelData['other_online_spend'] || settings.marketing_channels[2]?.monthly || Array(12).fill(0),
      local_marketing_spend: channelData['local_marketing_spend'] || settings.marketing_channels[3]?.monthly || Array(12).fill(0),
      direct_mail_spend: channelData['direct_mail_spend'] || settings.marketing_channels[4]?.monthly || Array(12).fill(0),
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

  // Marketing channel handlers
  const addMarketingChannel = () => {
    const newChannel: MarketingChannel = {
      id: `channel_${Date.now()}`,
      name: '',
      monthly: Array(12).fill(0),
    };
    setSettings({
      ...settings,
      marketing_channels: [...settings.marketing_channels, newChannel],
    });
  };

  const removeMarketingChannel = (index: number) => {
    const newChannels = settings.marketing_channels.filter((_, i) => i !== index);
    setSettings({ ...settings, marketing_channels: newChannels });
  };

  const updateMarketingChannel = (index: number, field: 'name' | 'monthly', value: string | number, monthIndex?: number) => {
    const newChannels = [...settings.marketing_channels];
    if (field === 'name') {
      newChannels[index] = { ...newChannels[index], name: value as string };
    } else if (field === 'monthly' && monthIndex !== undefined) {
      const newMonthly = [...newChannels[index].monthly];
      newMonthly[monthIndex] = value as number;
      newChannels[index] = { ...newChannels[index], monthly: newMonthly };
    }
    setSettings({ ...settings, marketing_channels: newChannels });
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
      
      // Marketing - use marketing_channels
      const marketing = settings.marketing_channels.reduce((sum, ch) => sum + (ch.monthly[i] || 0), 0);
      
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

  // Marketing budget calculations using marketing_channels
  const monthlyMarketingTotals = MONTHS.map((_, i) => {
    return settings.marketing_channels.reduce((sum, ch) => sum + (ch.monthly[i] || 0), 0);
  });
  
  const totalMarketingSpend = monthlyMarketingTotals.reduce((a, b) => a + b, 0);
  
  // Marketing KPIs - CPL and CPA (use target values if set, otherwise calculate)
  const totalLeadsGoal = settings.monthly_inbound_leads_goals.reduce((a, b) => a + b, 0);
  const calculatedCPL = totalLeadsGoal > 0 ? totalMarketingSpend / totalLeadsGoal : 0;
  const calculatedCPA = actuals.totalFirstTime > 0 ? totalMarketingSpend / actuals.totalFirstTime : 0;
  const costPerLead = settings.target_cpl > 0 ? settings.target_cpl : calculatedCPL;
  const costPerAcquisition = settings.target_cpa > 0 ? settings.target_cpa : calculatedCPA;
  
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
        // Use monthly-specific goals instead of dividing annual by 12
        firstTimeRevenueGoal: settings.monthly_first_time_goals?.[selectedSummaryMonth] || 0,
        recurringRevenueGoal: settings.monthly_recurring_goals?.[selectedSummaryMonth] || 0,
        fixedCostGoal: settings.monthly_fixed_cost_goals?.[selectedSummaryMonth] || 0,
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
      firstTimeRevenueGoal: settings.goal_first_time_revenue_amount,
      recurringRevenueGoal: settings.goal_repeat_revenue_amount,
      fixedCostGoal: settings.fixed_cost_goal,
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
                <TableCell className="text-right">{summaryData.firstTimeRevenueGoal > 0 ? `$${summaryData.firstTimeRevenueGoal.toLocaleString()}` : '—'}</TableCell>
                <TableCell className="text-center">
                  {summaryData.firstTimeRevenueGoal > 0 ? (
                    <Badge className={statusColors[getStatus(summaryData.firstTimeRevenue, summaryData.firstTimeRevenueGoal)]}>
                      {statusIcons[getStatus(summaryData.firstTimeRevenue, summaryData.firstTimeRevenueGoal)]} {getStatus(summaryData.firstTimeRevenue, summaryData.firstTimeRevenueGoal) === 'behind' ? 'Behind' : 'On Track'}
                    </Badge>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium pl-6 text-muted-foreground">→ Recurring Revenue</TableCell>
                <TableCell className="text-right">${summaryData.recurringRevenue.toLocaleString()}</TableCell>
                <TableCell className="text-right">{summaryData.recurringRevenueGoal > 0 ? `$${summaryData.recurringRevenueGoal.toLocaleString()}` : '—'}</TableCell>
                <TableCell className="text-center">
                  {summaryData.recurringRevenueGoal > 0 ? (
                    <Badge className={statusColors[getStatus(summaryData.recurringRevenue, summaryData.recurringRevenueGoal)]}>
                      {statusIcons[getStatus(summaryData.recurringRevenue, summaryData.recurringRevenueGoal)]} {getStatus(summaryData.recurringRevenue, summaryData.recurringRevenueGoal) === 'behind' ? 'Behind' : 'On Track'}
                    </Badge>
                  ) : <span className="text-muted-foreground">—</span>}
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
                <TableCell className="text-right">{summaryData.fixedCostGoal > 0 ? `Goal: $${summaryData.fixedCostGoal.toLocaleString()}` : '—'}</TableCell>
                <TableCell className="text-center">
                  {summaryData.fixedCostGoal > 0 ? (
                    <Badge className={statusColors[getStatus(summaryData.fixedCostGoal, summaryData.fixedCosts, false)]}>
                      {statusIcons[getStatus(summaryData.fixedCostGoal, summaryData.fixedCosts, false)]} {summaryData.fixedCosts <= summaryData.fixedCostGoal ? 'Under Goal' : 'Over Goal'}
                    </Badge>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
              <TableRow className="bg-muted/50 border-t-2">
                <TableCell className="font-bold">Net Profit ({summaryData.periodLabel})</TableCell>
                <TableCell className={`text-right font-bold ${summaryData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${summaryData.netProfit.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-medium">
                  ${(summaryData.revenueGoal * (settings.net_profit_goal_percent || 20) / 100).toLocaleString()} ({settings.net_profit_goal_percent || 20}% goal)
                </TableCell>
                <TableCell className="text-center">
                  <Badge className={statusColors[summaryData.revenue > 0 && (summaryData.netProfit / summaryData.revenue) * 100 >= (settings.net_profit_goal_percent || 20) ? 'ahead' : summaryData.revenue > 0 && (summaryData.netProfit / summaryData.revenue) * 100 >= (settings.net_profit_goal_percent || 20) / 2 ? 'at-risk' : 'behind']}>
                    {summaryData.revenue > 0 && (summaryData.netProfit / summaryData.revenue) * 100 >= (settings.net_profit_goal_percent || 20) ? '✅' : '⚠️'} {summaryData.revenue > 0 ? ((summaryData.netProfit / summaryData.revenue) * 100).toFixed(1) : 0}% margin
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
            <p className="text-xs text-muted-foreground">Target CPL</p>
            <div className="flex items-center gap-1">
              <span className="text-xl font-bold">$</span>
              <Input
                type="number"
                value={inputValue(settings.target_cpl)}
                onChange={(e) => setSettings({ ...settings, target_cpl: parseInputValue(e.target.value) })}
                className="w-20 text-xl font-bold"
                placeholder="0"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Actual: ${calculatedCPL.toFixed(2)} ({totalLeadsGoal} leads)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Target CPA</p>
            <div className="flex items-center gap-1">
              <span className="text-xl font-bold">$</span>
              <Input
                type="number"
                value={inputValue(settings.target_cpa)}
                onChange={(e) => setSettings({ ...settings, target_cpa: parseInputValue(e.target.value) })}
                className="w-20 text-xl font-bold"
                placeholder="0"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Actual: ${calculatedCPA.toFixed(2)} ({actuals.totalFirstTime} customers)
            </p>
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
          {/* Sub-tabs for Annual vs Monthly */}
          <Tabs defaultValue="annual" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-xs">
              <TabsTrigger value="annual">Annual</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>

            {/* Annual Goals Tab */}
            <TabsContent value="annual" className="mt-4">
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
            </TabsContent>

            {/* Monthly Goals Tab */}
            <TabsContent value="monthly" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">Monthly Revenue & Cost Goals</CardTitle>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">Net Profit Goal %:</Label>
                    <Input
                      type="number"
                      value={inputValue(settings.net_profit_goal_percent)}
                      onChange={(e) => setSettings({ ...settings, net_profit_goal_percent: parseInputValue(e.target.value) })}
                      className="w-20"
                      placeholder="20"
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">Set annual goals (used when viewing Yearly summary):</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>First-Time Revenue Goal (Annual $)</Label>
                      <Input
                        type="number"
                        value={inputValue(settings.goal_first_time_revenue_amount)}
                        onChange={(e) => setSettings({ ...settings, goal_first_time_revenue_amount: parseInputValue(e.target.value) })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>Recurring Revenue Goal (Annual $)</Label>
                      <Input
                        type="number"
                        value={inputValue(settings.goal_repeat_revenue_amount)}
                        onChange={(e) => setSettings({ ...settings, goal_repeat_revenue_amount: parseInputValue(e.target.value) })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>Fixed Cost Goal (Annual Max $)</Label>
                      <Input
                        type="number"
                        value={inputValue(settings.fixed_cost_goal)}
                        onChange={(e) => setSettings({ ...settings, fixed_cost_goal: parseInputValue(e.target.value) })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Monthly breakdown tables */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Monthly Goals (used when viewing Monthly summary)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Goal Type</TableHead>
                          {MONTHS.map(m => <TableHead key={m} className="text-right text-xs">{m}</TableHead>)}
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">First-Time ($)</TableCell>
                          {MONTHS.map((_, i) => (
                            <TableCell key={i} className="p-1">
                              <Input
                                type="number"
                                value={inputValue(settings.monthly_first_time_goals?.[i] || 0)}
                                onChange={(e) => {
                                  const updated = [...(settings.monthly_first_time_goals || Array(12).fill(0))];
                                  updated[i] = parseInputValue(e.target.value);
                                  setSettings({ ...settings, monthly_first_time_goals: updated });
                                }}
                                className="w-16 text-xs text-right"
                                placeholder="0"
                              />
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-bold">
                            ${(settings.monthly_first_time_goals || Array(12).fill(0)).reduce((a, b) => a + b, 0).toLocaleString()}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Recurring ($)</TableCell>
                          {MONTHS.map((_, i) => (
                            <TableCell key={i} className="p-1">
                              <Input
                                type="number"
                                value={inputValue(settings.monthly_recurring_goals?.[i] || 0)}
                                onChange={(e) => {
                                  const updated = [...(settings.monthly_recurring_goals || Array(12).fill(0))];
                                  updated[i] = parseInputValue(e.target.value);
                                  setSettings({ ...settings, monthly_recurring_goals: updated });
                                }}
                                className="w-16 text-xs text-right"
                                placeholder="0"
                              />
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-bold">
                            ${(settings.monthly_recurring_goals || Array(12).fill(0)).reduce((a, b) => a + b, 0).toLocaleString()}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Fixed Cost Max ($)</TableCell>
                          {MONTHS.map((_, i) => (
                            <TableCell key={i} className="p-1">
                              <Input
                                type="number"
                                value={inputValue(settings.monthly_fixed_cost_goals?.[i] || 0)}
                                onChange={(e) => {
                                  const updated = [...(settings.monthly_fixed_cost_goals || Array(12).fill(0))];
                                  updated[i] = parseInputValue(e.target.value);
                                  setSettings({ ...settings, monthly_fixed_cost_goals: updated });
                                }}
                                className="w-16 text-xs text-right"
                                placeholder="0"
                              />
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-bold">
                            ${(settings.monthly_fixed_cost_goals || Array(12).fill(0)).reduce((a, b) => a + b, 0).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Marketing Spend by Channel</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={String(selectedMarketingMonth)} onValueChange={(v) => setSelectedMarketingMonth(Number(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={addMarketingChannel}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">Editing spend for: <strong>{MONTHS[selectedMarketingMonth]}</strong></p>
              {settings.marketing_channels.map((channel, i) => (
                <div key={channel.id} className="flex items-center gap-2">
                  <Input
                    value={channel.name}
                    onChange={(e) => updateMarketingChannel(i, 'name', e.target.value)}
                    placeholder="Channel name"
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={inputValue(channel.monthly[selectedMarketingMonth] || 0)}
                    onChange={(e) => updateMarketingChannel(i, 'monthly', parseInputValue(e.target.value), selectedMarketingMonth)}
                    className="w-24"
                    placeholder="0"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeMarketingChannel(i)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <div className="pt-2 border-t space-y-1">
                <p className="text-sm font-medium">
                  {MONTHS[selectedMarketingMonth]} Total: ${settings.marketing_channels.reduce((sum, ch) => sum + (ch.monthly[selectedMarketingMonth] || 0), 0).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  YTD Total: ${totalMarketingSpend.toLocaleString()}
                </p>
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
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Fixed Overhead (Monthly)</CardTitle>
                <Link to="/dashboard/expenses" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <FileText className="w-3 h-3" /> View Expenses
                </Link>
              </div>
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
              {settings.fixed_overhead_items.map((item, i) => {
                // Find matching expense category for this item
                const matchingCategory = Object.entries(EXPENSE_CATEGORY_MAP).find(
                  ([_, map]) => map.type === 'fixed' && map.name.toLowerCase() === item.name.toLowerCase()
                )?.[0];
                const actualAmount = matchingCategory ? (actualExpenses.byCategory[matchingCategory]?.[selectedOverheadMonth] || 0) : 0;
                
                return (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={item.name}
                      onChange={(e) => updateOverheadItem('fixed', i, 'name', e.target.value)}
                      placeholder="Item name"
                      className="flex-1"
                    />
                    <div className="flex flex-col items-end gap-0.5">
                      <Input
                        type="number"
                        value={inputValue(item.monthly[selectedOverheadMonth] || 0)}
                        onChange={(e) => updateOverheadItem('fixed', i, 'monthly', parseInputValue(e.target.value), selectedOverheadMonth)}
                        className="w-24"
                        placeholder="0"
                      />
                      {actualAmount > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          Actual: ${actualAmount.toFixed(0)}
                        </span>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeOverheadItem('fixed', i)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
              <div className="pt-2 border-t space-y-1">
                <p className="text-sm font-medium">
                  {MONTHS[selectedOverheadMonth]} Budget: ${settings.fixed_overhead_items.reduce((sum, item) => sum + (item.monthly[selectedOverheadMonth] || 0), 0).toLocaleString()}
                </p>
                {(() => {
                  const fixedCategories = Object.entries(EXPENSE_CATEGORY_MAP)
                    .filter(([_, map]) => map.type === 'fixed')
                    .map(([cat]) => cat);
                  const actualMonthTotal = fixedCategories.reduce((sum, cat) => 
                    sum + (actualExpenses.byCategory[cat]?.[selectedOverheadMonth] || 0), 0
                  );
                  return actualMonthTotal > 0 ? (
                    <p className="text-xs text-primary">
                      {MONTHS[selectedOverheadMonth]} Actual (from Expenses): ${actualMonthTotal.toLocaleString()}
                    </p>
                  ) : null;
                })()}
                <p className="text-xs text-muted-foreground">
                  YTD Budget: ${settings.fixed_overhead_items.reduce((sum, item) => sum + item.monthly.reduce((a, b) => a + b, 0), 0).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Variable Overhead (Monthly)</CardTitle>
                <Link to="/dashboard/expenses" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <FileText className="w-3 h-3" /> View Expenses
                </Link>
              </div>
              <Button variant="outline" size="sm" onClick={() => addOverheadItem('variable')}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">Editing costs for: <strong>{MONTHS[selectedOverheadMonth]}</strong></p>
              {settings.variable_overhead_items.map((item, i) => {
                // Find matching expense category for this item
                const matchingCategory = Object.entries(EXPENSE_CATEGORY_MAP).find(
                  ([_, map]) => map.type === 'variable' && map.name.toLowerCase() === item.name.toLowerCase()
                )?.[0];
                const actualAmount = matchingCategory ? (actualExpenses.byCategory[matchingCategory]?.[selectedOverheadMonth] || 0) : 0;
                
                return (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={item.name}
                      onChange={(e) => updateOverheadItem('variable', i, 'name', e.target.value)}
                      placeholder="Item name"
                      className="flex-1"
                    />
                    <div className="flex flex-col items-end gap-0.5">
                      <Input
                        type="number"
                        value={inputValue(item.monthly[selectedOverheadMonth] || 0)}
                        onChange={(e) => updateOverheadItem('variable', i, 'monthly', parseInputValue(e.target.value), selectedOverheadMonth)}
                        className="w-24"
                        placeholder="0"
                      />
                      {actualAmount > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          Actual: ${actualAmount.toFixed(0)}
                        </span>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeOverheadItem('variable', i)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
              <div className="pt-2 border-t space-y-1">
                <p className="text-sm font-medium">
                  {MONTHS[selectedOverheadMonth]} Budget: ${settings.variable_overhead_items.reduce((sum, item) => sum + (item.monthly[selectedOverheadMonth] || 0), 0).toLocaleString()}
                </p>
                {(() => {
                  const variableCategories = Object.entries(EXPENSE_CATEGORY_MAP)
                    .filter(([_, map]) => map.type === 'variable')
                    .map(([cat]) => cat);
                  const actualMonthTotal = variableCategories.reduce((sum, cat) => 
                    sum + (actualExpenses.byCategory[cat]?.[selectedOverheadMonth] || 0), 0
                  );
                  return actualMonthTotal > 0 ? (
                    <p className="text-xs text-primary">
                      {MONTHS[selectedOverheadMonth]} Actual (from Expenses): ${actualMonthTotal.toLocaleString()}
                    </p>
                  ) : null;
                })()}
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
