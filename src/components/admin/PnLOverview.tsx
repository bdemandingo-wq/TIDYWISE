import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { useToast } from '@/hooks/use-toast';
import { BookingWithDetails } from '@/hooks/useBookings';
import { Save, TrendingUp, TrendingDown, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { startOfYear, endOfYear, getMonth } from 'date-fns';
import type { Json } from '@/integrations/supabase/types';

interface PnLOverviewProps {
  bookings: BookingWithDetails[];
  customers: any[];
}

interface OverheadItem {
  name: string;
  amount: number;
}

interface MarketingChannel {
  name: string;
  amount: number;
}

interface PnLSettings {
  id?: string;
  year: number;
  annual_revenue_goal: number;
  net_profit_goal_percent: number;
  avg_job_size_goal: number;
  closing_rate_goal: number;
  target_cpl: number;
  target_cpa: number;
  credit_card_percent: number;
  refunds_percent: number;
  fixed_overhead: OverheadItem[];
  variable_overhead: OverheadItem[];
  marketing_channels: MarketingChannel[];
  monthly_marketing_budget: number;
  monthly_lead_goal: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const defaultSettings: PnLSettings = {
  year: new Date().getFullYear(),
  annual_revenue_goal: 0,
  net_profit_goal_percent: 20,
  avg_job_size_goal: 250,
  closing_rate_goal: 50,
  target_cpl: 0,
  target_cpa: 0,
  credit_card_percent: 2.9,
  refunds_percent: 2,
  fixed_overhead: [
    { name: 'Booking Software', amount: 0 },
    { name: 'Insurance', amount: 0 },
    { name: 'Phone/VoIP', amount: 0 },
  ],
  variable_overhead: [
    { name: 'Supplies', amount: 0 },
    { name: 'Gas/Mileage', amount: 0 },
  ],
  marketing_channels: [
    { name: 'Google Ads', amount: 0 },
    { name: 'Facebook Ads', amount: 0 },
  ],
  monthly_marketing_budget: 0,
  monthly_lead_goal: 0,
};

export function PnLOverview({ bookings, customers }: PnLOverviewProps) {
  const orgId = useOrgId();
  const { toast } = useToast();
  const [settings, setSettings] = useState<PnLSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(['goals']);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const organizationId = orgId.organizationId;

  // Fetch settings
  useEffect(() => {
    const fetchSettings = async () => {
      if (!organizationId) return;
      
      const { data } = await supabase
        .from('pnl_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('year', currentYear)
        .maybeSingle();
      
      if (data) {
        // Parse legacy data into new simplified format
        const fixedOverhead = Array.isArray(data.fixed_overhead_items) 
          ? (data.fixed_overhead_items as any[]).map(item => ({
              name: item.name || '',
              amount: Array.isArray(item.monthly) ? item.monthly.reduce((a: number, b: number) => a + b, 0) / 12 : (item.amount || 0)
            }))
          : defaultSettings.fixed_overhead;

        const variableOverhead = Array.isArray(data.variable_overhead_items)
          ? (data.variable_overhead_items as any[]).map(item => ({
              name: item.name || '',
              amount: Array.isArray(item.monthly) ? item.monthly.reduce((a: number, b: number) => a + b, 0) / 12 : (item.amount || 0)
            }))
          : defaultSettings.variable_overhead;

        const marketingChannels: MarketingChannel[] = [];
        const channelNames = (data as any).marketing_channel_names || {};
        ['google_lsa_spend', 'facebook_ads_spend', 'other_online_spend', 'local_marketing_spend', 'direct_mail_spend'].forEach(key => {
          const arr = (data as any)[key];
          if (Array.isArray(arr)) {
            const total = arr.reduce((a: number, b: number) => a + b, 0);
            if (total > 0 || !marketingChannels.length) {
              marketingChannels.push({
                name: channelNames[key] || key.replace('_spend', '').replace(/_/g, ' '),
                amount: total / 12
              });
            }
          }
        });

        setSettings({
          ...defaultSettings,
          id: data.id,
          annual_revenue_goal: Number(data.annual_revenue_goal) || 0,
          net_profit_goal_percent: Number((data as any).net_profit_goal_percent) || 20,
          avg_job_size_goal: Number(data.avg_job_size_goal) || 250,
          closing_rate_goal: Number(data.closing_rate_goal) || 50,
          target_cpl: Number((data as any).target_cpl) || 0,
          target_cpa: Number((data as any).target_cpa) || 0,
          credit_card_percent: Number(data.credit_card_percent) || 2.9,
          refunds_percent: Number(data.refunds_percent) || 2,
          fixed_overhead: fixedOverhead.length ? fixedOverhead : defaultSettings.fixed_overhead,
          variable_overhead: variableOverhead.length ? variableOverhead : defaultSettings.variable_overhead,
          marketing_channels: marketingChannels.length ? marketingChannels : defaultSettings.marketing_channels,
          monthly_marketing_budget: Array.isArray((data as any).monthly_marketing_budget) 
            ? (data as any).monthly_marketing_budget.reduce((a: number, b: number) => a + b, 0) / 12 
            : 0,
          monthly_lead_goal: Array.isArray(data.monthly_inbound_leads_goals)
            ? (data.monthly_inbound_leads_goals as number[]).reduce((a, b) => a + b, 0) / 12
            : 0,
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

    const completedBookings = yearBookings.filter(b => b.status === 'completed');
    
    // Track addresses for first-time vs recurring
    const addressFirstSeen: Record<string, number> = {};
    const sortedBookings = [...completedBookings].sort((a, b) => 
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );
    
    sortedBookings.forEach(b => {
      const address = (b.address || '').toLowerCase().trim();
      if (address && !(address in addressFirstSeen)) {
        addressFirstSeen[address] = getMonth(new Date(b.scheduled_at));
      }
    });

    let totalRevenue = 0;
    let totalLaborCost = 0;
    let firstTimeRevenue = 0;
    let recurringRevenue = 0;
    let firstTimeCount = 0;
    let recurringCount = 0;

    completedBookings.forEach(b => {
      const amount = Number(b.total_amount || 0);
      totalRevenue += amount;
      totalLaborCost += Number((b as any).cleaner_actual_payment || (b as any).cleaner_wage || 0);
      
      const address = (b.address || '').toLowerCase().trim();
      const month = getMonth(new Date(b.scheduled_at));
      
      if (address && addressFirstSeen[address] === month) {
        firstTimeRevenue += amount;
        firstTimeCount++;
      } else {
        recurringRevenue += amount;
        recurringCount++;
      }
    });

    return {
      totalRevenue,
      totalLaborCost,
      firstTimeRevenue,
      recurringRevenue,
      firstTimeCount,
      recurringCount,
      totalJobs: completedBookings.length,
      avgJobSize: completedBookings.length > 0 ? totalRevenue / completedBookings.length : 0,
      repeatPercent: totalRevenue > 0 ? (recurringRevenue / totalRevenue) * 100 : 0,
    };
  }, [bookings, currentYear]);

  // P&L calculations
  const pnl = useMemo(() => {
    const revenue = actuals.totalRevenue;
    const laborCost = actuals.totalLaborCost;
    const ccFees = revenue * (settings.credit_card_percent / 100);
    const refunds = revenue * (settings.refunds_percent / 100);
    const cogs = laborCost + ccFees + refunds;
    const grossProfit = revenue - cogs;
    
    const fixedCosts = settings.fixed_overhead.reduce((sum, item) => sum + (item.amount * 12), 0);
    const variableCosts = settings.variable_overhead.reduce((sum, item) => sum + (item.amount * 12), 0);
    const marketingSpend = settings.marketing_channels.reduce((sum, ch) => sum + (ch.amount * 12), 0);
    const totalExpenses = fixedCosts + variableCosts + marketingSpend;
    
    const netProfit = grossProfit - totalExpenses;
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    return {
      revenue,
      cogs,
      grossProfit,
      grossMargin,
      fixedCosts,
      variableCosts,
      marketingSpend,
      totalExpenses,
      netProfit,
      profitMargin,
    };
  }, [actuals, settings]);

  const saveSettings = async () => {
    if (!organizationId) return;
    setSaving(true);

    // Convert simplified format back to legacy database format
    const fixedOverheadItems = settings.fixed_overhead.map(item => ({
      name: item.name,
      monthly: Array(12).fill(item.amount)
    }));

    const variableOverheadItems = settings.variable_overhead.map(item => ({
      name: item.name,
      monthly: Array(12).fill(item.amount)
    }));

    const payload = {
      organization_id: organizationId,
      year: currentYear,
      annual_revenue_goal: settings.annual_revenue_goal,
      net_profit_goal_percent: settings.net_profit_goal_percent,
      avg_job_size_goal: settings.avg_job_size_goal,
      closing_rate_goal: settings.closing_rate_goal,
      target_cpl: settings.target_cpl,
      target_cpa: settings.target_cpa,
      credit_card_percent: settings.credit_card_percent,
      refunds_percent: settings.refunds_percent,
      fixed_overhead_items: fixedOverheadItems as unknown as Json,
      variable_overhead_items: variableOverheadItems as unknown as Json,
      monthly_marketing_budget: Array(12).fill(settings.monthly_marketing_budget) as unknown as Json,
      monthly_inbound_leads_goals: Array(12).fill(settings.monthly_lead_goal) as unknown as Json,
      google_lsa_spend: Array(12).fill(settings.marketing_channels[0]?.amount || 0) as unknown as Json,
      facebook_ads_spend: Array(12).fill(settings.marketing_channels[1]?.amount || 0) as unknown as Json,
      other_online_spend: Array(12).fill(settings.marketing_channels[2]?.amount || 0) as unknown as Json,
      local_marketing_spend: Array(12).fill(settings.marketing_channels[3]?.amount || 0) as unknown as Json,
      direct_mail_spend: Array(12).fill(settings.marketing_channels[4]?.amount || 0) as unknown as Json,
      marketing_channel_names: settings.marketing_channels.reduce((acc, ch, i) => {
        const keys = ['google_lsa_spend', 'facebook_ads_spend', 'other_online_spend', 'local_marketing_spend', 'direct_mail_spend'];
        if (keys[i]) acc[keys[i]] = ch.name;
        return acc;
      }, {} as Record<string, string>) as unknown as Json,
    };

    const { data: existing } = await supabase
      .from('pnl_settings')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('year', currentYear)
      .maybeSingle();

    let error;
    if (existing) {
      const result = await supabase.from('pnl_settings').update(payload).eq('id', existing.id);
      error = result.error;
    } else {
      const result = await supabase.from('pnl_settings').insert(payload);
      error = result.error;
    }

    setSaving(false);
    if (error) {
      toast({ title: 'Error saving settings', variant: 'destructive' });
    } else {
      toast({ title: 'Settings saved!' });
    }
  };

  const toggleSection = (section: string) => {
    setOpenSections(prev => 
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };

  const inputVal = (v: number) => v === 0 ? '' : v;
  const parseVal = (v: string) => v === '' ? 0 : Number(v);

  const progressPercent = settings.annual_revenue_goal > 0 
    ? Math.min((actuals.totalRevenue / settings.annual_revenue_goal) * 100, 100) 
    : 0;

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">P&L Overview</h2>
          <p className="text-muted-foreground text-sm">{currentYear} Financial Summary</p>
        </div>
        <Button onClick={saveSettings} disabled={saving} size="sm">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {/* Key Metrics - Always Visible */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Revenue YTD</p>
            <p className="text-2xl font-bold">${actuals.totalRevenue.toLocaleString()}</p>
            <Progress value={progressPercent} className="h-1.5 mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {progressPercent.toFixed(0)}% of ${settings.annual_revenue_goal.toLocaleString()} goal
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Net Profit</p>
            <p className={`text-2xl font-bold ${pnl.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${pnl.netProfit.toLocaleString()}
            </p>
            <div className="flex items-center gap-1 mt-1">
              {pnl.netProfit >= 0 ? <TrendingUp className="w-3 h-3 text-green-600" /> : <TrendingDown className="w-3 h-3 text-red-600" />}
              <span className="text-xs text-muted-foreground">{pnl.profitMargin.toFixed(1)}% margin</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Avg Job Size</p>
            <p className="text-2xl font-bold">${actuals.avgJobSize.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Goal: ${settings.avg_job_size_goal}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Jobs Completed</p>
            <p className="text-2xl font-bold">{actuals.totalJobs}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {actuals.firstTimeCount} new / {actuals.recurringCount} repeat
            </p>
          </CardContent>
        </Card>
      </div>

      {/* P&L Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Profit & Loss Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between py-2 border-b">
            <span>Revenue</span>
            <span className="font-medium">${pnl.revenue.toLocaleString()}</span>
          </div>
          <div className="flex justify-between py-2 text-sm text-muted-foreground">
            <span className="pl-4">− Cost of Sales (Labor, CC Fees, Refunds)</span>
            <span>-${pnl.cogs.toLocaleString()}</span>
          </div>
          <div className="flex justify-between py-2 border-b font-medium">
            <span>Gross Profit</span>
            <span>${pnl.grossProfit.toLocaleString()} ({pnl.grossMargin.toFixed(1)}%)</span>
          </div>
          <div className="flex justify-between py-2 text-sm text-muted-foreground">
            <span className="pl-4">− Fixed Costs</span>
            <span>-${pnl.fixedCosts.toLocaleString()}</span>
          </div>
          <div className="flex justify-between py-2 text-sm text-muted-foreground">
            <span className="pl-4">− Variable Costs</span>
            <span>-${pnl.variableCosts.toLocaleString()}</span>
          </div>
          <div className="flex justify-between py-2 text-sm text-muted-foreground">
            <span className="pl-4">− Marketing</span>
            <span>-${pnl.marketingSpend.toLocaleString()}</span>
          </div>
          <div className={`flex justify-between py-3 border-t-2 font-bold text-lg ${pnl.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            <span>Net Profit</span>
            <span>${pnl.netProfit.toLocaleString()} ({pnl.profitMargin.toFixed(1)}%)</span>
          </div>
        </CardContent>
      </Card>

      {/* Collapsible Settings Sections */}
      <div className="space-y-3">
        {/* Goals Section */}
        <Collapsible open={openSections.includes('goals')} onOpenChange={() => toggleSection('goals')}>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <CardTitle className="text-base">Goals & Targets</CardTitle>
                <ChevronDown className={`w-5 h-5 transition-transform ${openSections.includes('goals') ? 'rotate-180' : ''}`} />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs">Annual Revenue Goal</Label>
                    <Input
                      type="number"
                      value={inputVal(settings.annual_revenue_goal)}
                      onChange={(e) => setSettings({ ...settings, annual_revenue_goal: parseVal(e.target.value) })}
                      placeholder="$0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Net Profit Goal %</Label>
                    <Input
                      type="number"
                      value={inputVal(settings.net_profit_goal_percent)}
                      onChange={(e) => setSettings({ ...settings, net_profit_goal_percent: parseVal(e.target.value) })}
                      placeholder="20"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Avg Job Size Goal</Label>
                    <Input
                      type="number"
                      value={inputVal(settings.avg_job_size_goal)}
                      onChange={(e) => setSettings({ ...settings, avg_job_size_goal: parseVal(e.target.value) })}
                      placeholder="$250"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Closing Rate %</Label>
                    <Input
                      type="number"
                      value={inputVal(settings.closing_rate_goal)}
                      onChange={(e) => setSettings({ ...settings, closing_rate_goal: parseVal(e.target.value) })}
                      placeholder="50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Target Cost Per Lead</Label>
                    <Input
                      type="number"
                      value={inputVal(settings.target_cpl)}
                      onChange={(e) => setSettings({ ...settings, target_cpl: parseVal(e.target.value) })}
                      placeholder="$0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Target Cost Per Acquisition</Label>
                    <Input
                      type="number"
                      value={inputVal(settings.target_cpa)}
                      onChange={(e) => setSettings({ ...settings, target_cpa: parseVal(e.target.value) })}
                      placeholder="$0"
                    />
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Fixed Costs Section */}
        <Collapsible open={openSections.includes('fixed')} onOpenChange={() => toggleSection('fixed')}>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Fixed Costs</CardTitle>
                  <Badge variant="outline" className="text-xs">${pnl.fixedCosts.toLocaleString()}/yr</Badge>
                </div>
                <ChevronDown className={`w-5 h-5 transition-transform ${openSections.includes('fixed') ? 'rotate-180' : ''}`} />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-2">
                <p className="text-xs text-muted-foreground mb-3">Enter your average monthly cost for each item</p>
                {settings.fixed_overhead.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={item.name}
                      onChange={(e) => {
                        const updated = [...settings.fixed_overhead];
                        updated[i] = { ...item, name: e.target.value };
                        setSettings({ ...settings, fixed_overhead: updated });
                      }}
                      placeholder="Item name"
                      className="flex-1"
                    />
                    <div className="flex items-center">
                      <span className="text-sm text-muted-foreground mr-1">$</span>
                      <Input
                        type="number"
                        value={inputVal(item.amount)}
                        onChange={(e) => {
                          const updated = [...settings.fixed_overhead];
                          updated[i] = { ...item, amount: parseVal(e.target.value) };
                          setSettings({ ...settings, fixed_overhead: updated });
                        }}
                        placeholder="0"
                        className="w-24"
                      />
                      <span className="text-xs text-muted-foreground ml-1">/mo</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => setSettings({ 
                        ...settings, 
                        fixed_overhead: settings.fixed_overhead.filter((_, idx) => idx !== i) 
                      })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSettings({ 
                    ...settings, 
                    fixed_overhead: [...settings.fixed_overhead, { name: '', amount: 0 }] 
                  })}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Item
                </Button>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Variable Costs Section */}
        <Collapsible open={openSections.includes('variable')} onOpenChange={() => toggleSection('variable')}>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Variable Costs</CardTitle>
                  <Badge variant="outline" className="text-xs">${pnl.variableCosts.toLocaleString()}/yr</Badge>
                </div>
                <ChevronDown className={`w-5 h-5 transition-transform ${openSections.includes('variable') ? 'rotate-180' : ''}`} />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-2">
                <p className="text-xs text-muted-foreground mb-3">Enter your average monthly cost for each item</p>
                {settings.variable_overhead.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={item.name}
                      onChange={(e) => {
                        const updated = [...settings.variable_overhead];
                        updated[i] = { ...item, name: e.target.value };
                        setSettings({ ...settings, variable_overhead: updated });
                      }}
                      placeholder="Item name"
                      className="flex-1"
                    />
                    <div className="flex items-center">
                      <span className="text-sm text-muted-foreground mr-1">$</span>
                      <Input
                        type="number"
                        value={inputVal(item.amount)}
                        onChange={(e) => {
                          const updated = [...settings.variable_overhead];
                          updated[i] = { ...item, amount: parseVal(e.target.value) };
                          setSettings({ ...settings, variable_overhead: updated });
                        }}
                        placeholder="0"
                        className="w-24"
                      />
                      <span className="text-xs text-muted-foreground ml-1">/mo</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => setSettings({ 
                        ...settings, 
                        variable_overhead: settings.variable_overhead.filter((_, idx) => idx !== i) 
                      })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSettings({ 
                    ...settings, 
                    variable_overhead: [...settings.variable_overhead, { name: '', amount: 0 }] 
                  })}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Item
                </Button>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Marketing Section */}
        <Collapsible open={openSections.includes('marketing')} onOpenChange={() => toggleSection('marketing')}>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Marketing</CardTitle>
                  <Badge variant="outline" className="text-xs">${pnl.marketingSpend.toLocaleString()}/yr</Badge>
                </div>
                <ChevronDown className={`w-5 h-5 transition-transform ${openSections.includes('marketing') ? 'rotate-180' : ''}`} />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-2">
                <p className="text-xs text-muted-foreground mb-3">Enter your average monthly spend per channel</p>
                {settings.marketing_channels.map((channel, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={channel.name}
                      onChange={(e) => {
                        const updated = [...settings.marketing_channels];
                        updated[i] = { ...channel, name: e.target.value };
                        setSettings({ ...settings, marketing_channels: updated });
                      }}
                      placeholder="Channel name"
                      className="flex-1"
                    />
                    <div className="flex items-center">
                      <span className="text-sm text-muted-foreground mr-1">$</span>
                      <Input
                        type="number"
                        value={inputVal(channel.amount)}
                        onChange={(e) => {
                          const updated = [...settings.marketing_channels];
                          updated[i] = { ...channel, amount: parseVal(e.target.value) };
                          setSettings({ ...settings, marketing_channels: updated });
                        }}
                        placeholder="0"
                        className="w-24"
                      />
                      <span className="text-xs text-muted-foreground ml-1">/mo</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => setSettings({ 
                        ...settings, 
                        marketing_channels: settings.marketing_channels.filter((_, idx) => idx !== i) 
                      })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSettings({ 
                    ...settings, 
                    marketing_channels: [...settings.marketing_channels, { name: '', amount: 0 }] 
                  })}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Channel
                </Button>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* COGS Settings Section */}
        <Collapsible open={openSections.includes('cogs')} onOpenChange={() => toggleSection('cogs')}>
          <Card>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Cost of Sales Settings</CardTitle>
                  <Badge variant="outline" className="text-xs">${pnl.cogs.toLocaleString()}/yr</Badge>
                </div>
                <ChevronDown className={`w-5 h-5 transition-transform ${openSections.includes('cogs') ? 'rotate-180' : ''}`} />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Labor Costs (from completed bookings)</p>
                  <p className="text-xl font-bold">${actuals.totalLaborCost.toLocaleString()}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Credit Card Processing %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={inputVal(settings.credit_card_percent)}
                      onChange={(e) => setSettings({ ...settings, credit_card_percent: parseVal(e.target.value) })}
                      placeholder="2.9"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Refunds %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={inputVal(settings.refunds_percent)}
                      onChange={(e) => setSettings({ ...settings, refunds_percent: parseVal(e.target.value) })}
                      placeholder="2"
                    />
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </div>
  );
}
