import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  Flame, 
  Target, 
  Crown, 
  RefreshCw,
  Lightbulb,
  Clock,
  DollarSign,
  Users,
  Phone,
  Mail,
  Calendar
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface LeadIntelligence {
  id: string;
  lead_id: string;
  conversion_score: number;
  urgency_score: number;
  engagement_score: number;
  is_hot_lead: boolean;
  predicted_conversion_rate: number;
  recommended_followup_time: string | null;
  preferred_contact_method: string;
  ai_insights: any;
  last_calculated_at: string;
  lead?: {
    name: string;
    email: string;
    phone: string | null;
    source: string;
    status: string;
    created_at: string;
  };
}

interface CustomerIntelligence {
  id: string;
  customer_id: string;
  predicted_lifetime_value: number;
  next_booking_probability: number;
  predicted_next_booking_date: string | null;
  churn_risk_score: number;
  churn_risk_level: string;
  days_since_last_contact: number;
  sentiment_score: number;
  upsell_potential_score: number;
  recommended_services: any[];
  is_vip: boolean;
  vip_reason: string | null;
  ai_insights: any;
  last_calculated_at: string;
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface BusinessIntelligence {
  id: string;
  predicted_monthly_revenue: number;
  revenue_goal_probability: number;
  bookings_needed_for_goal: number;
  avg_lead_conversion_rate: number;
  best_converting_source: string | null;
  best_converting_day: string | null;
  optimal_response_window_minutes: number;
  optimal_price_range_low: number | null;
  optimal_price_range_high: number | null;
  price_win_rate: number | null;
  top_insights: string[];
  recommendations: any[];
  last_calculated_at: string;
}

export function AIIntelligenceDashboard() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch lead intelligence
  const { data: leadIntelligence = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['lead-intelligence', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('lead_intelligence')
        .select(`
          *,
          lead:leads(name, email, phone, source, status, created_at)
        `)
        .eq('organization_id', organization.id)
        .order('conversion_score', { ascending: false });
      if (error) throw error;
      return data as LeadIntelligence[];
    },
    enabled: !!organization?.id,
  });

  // Fetch customer intelligence
  const { data: customerIntelligence = [], isLoading: customersLoading } = useQuery({
    queryKey: ['customer-intelligence', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('customer_intelligence')
        .select(`
          *,
          customer:customers(first_name, last_name, email)
        `)
        .eq('organization_id', organization.id)
        .order('churn_risk_score', { ascending: false });
      if (error) throw error;
      return data as CustomerIntelligence[];
    },
    enabled: !!organization?.id,
  });

  // Fetch business intelligence
  const { data: businessIntelligence, isLoading: businessLoading } = useQuery({
    queryKey: ['business-intelligence', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;
      const { data, error } = await supabase
        .from('business_intelligence')
        .select('*')
        .eq('organization_id', organization.id)
        .maybeSingle();
      if (error) throw error;
      return data as BusinessIntelligence | null;
    },
    enabled: !!organization?.id,
  });

  // Refresh intelligence mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('calculate-ai-intelligence', {
        body: { organization_id: organization?.id, calculation_type: 'all' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-intelligence'] });
      queryClient.invalidateQueries({ queryKey: ['customer-intelligence'] });
      queryClient.invalidateQueries({ queryKey: ['business-intelligence'] });
      toast.success('AI intelligence updated successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to refresh: ${error.message}`);
    },
  });

  // Computed stats
  const hotLeads = useMemo(() => 
    leadIntelligence.filter(l => l.is_hot_lead), 
    [leadIntelligence]
  );

  const atRiskCustomers = useMemo(() => 
    customerIntelligence.filter(c => c.churn_risk_level === 'critical' || c.churn_risk_level === 'high'),
    [customerIntelligence]
  );

  const vipCustomers = useMemo(() =>
    customerIntelligence.filter(c => c.is_vip),
    [customerIntelligence]
  );

  const urgentFollowups = useMemo(() =>
    leadIntelligence.filter(l => {
      if (!l.recommended_followup_time) return false;
      return new Date(l.recommended_followup_time) <= new Date();
    }),
    [leadIntelligence]
  );

  const isLoading = leadsLoading || customersLoading || businessLoading;

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600 bg-green-100 dark:bg-green-900/30';
    if (score >= 40) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30';
    return 'text-red-600 bg-red-100 dark:bg-red-900/30';
  };

  const getChurnBadge = (level: string) => {
    switch (level) {
      case 'critical': return <Badge variant="destructive">Critical Risk</Badge>;
      case 'high': return <Badge className="bg-orange-500">High Risk</Badge>;
      case 'medium': return <Badge variant="secondary">Medium Risk</Badge>;
      default: return <Badge variant="outline">Low Risk</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">AI Intelligence Center</h2>
            <p className="text-sm text-muted-foreground">
              {businessIntelligence?.last_calculated_at 
                ? `Updated ${formatDistanceToNow(new Date(businessIntelligence.last_calculated_at))} ago`
                : 'No data yet - click refresh to analyze'}
            </p>
          </div>
        </div>
        <Button 
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          {refreshMutation.isPending ? 'Analyzing...' : 'Refresh AI Analysis'}
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/30 dark:to-orange-900/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <Flame className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{hotLeads.length}</p>
                <p className="text-sm text-orange-600/80 dark:text-orange-300/80">Hot Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 dark:border-red-800 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">{atRiskCustomers.length}</p>
                <p className="text-sm text-red-600/80 dark:text-red-300/80">At Risk</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Crown className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">{vipCustomers.length}</p>
                <p className="text-sm text-purple-600/80 dark:text-purple-300/80">VIP Customers</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{urgentFollowups.length}</p>
                <p className="text-sm text-blue-600/80 dark:text-blue-300/80">Urgent Follow-ups</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Business Intelligence Overview */}
      {businessIntelligence && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              AI Business Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Revenue Prediction */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Monthly Goal Progress</span>
                  <span className="text-sm font-medium">{businessIntelligence.revenue_goal_probability?.toFixed(0)}%</span>
                </div>
                <Progress value={businessIntelligence.revenue_goal_probability || 0} className="h-3" />
                <div className="flex items-center justify-between text-sm">
                  <span>Predicted Revenue: <strong>${businessIntelligence.predicted_monthly_revenue?.toFixed(0)}</strong></span>
                  <span className="text-muted-foreground">
                    {businessIntelligence.bookings_needed_for_goal} more bookings needed
                  </span>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <TrendingUp className="h-4 w-4" />
                    Conversion Rate
                  </div>
                  <p className="text-xl font-bold">{businessIntelligence.avg_lead_conversion_rate?.toFixed(1)}%</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Target className="h-4 w-4" />
                    Best Source
                  </div>
                  <p className="text-xl font-bold capitalize">{businessIntelligence.best_converting_source || '-'}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Calendar className="h-4 w-4" />
                    Best Day
                  </div>
                  <p className="text-xl font-bold">{businessIntelligence.best_converting_day || '-'}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <DollarSign className="h-4 w-4" />
                    Optimal Price
                  </div>
                  <p className="text-xl font-bold">
                    ${businessIntelligence.optimal_price_range_low?.toFixed(0) || '?'}-${businessIntelligence.optimal_price_range_high?.toFixed(0) || '?'}
                  </p>
                </div>
              </div>
            </div>

            {/* AI Insights */}
            {businessIntelligence.top_insights && businessIntelligence.top_insights.length > 0 && (
              <div className="mt-6 p-4 rounded-lg bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  AI-Generated Insights
                </h4>
                <ul className="space-y-2">
                  {businessIntelligence.top_insights.map((insight, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {businessIntelligence.recommendations && businessIntelligence.recommendations.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium mb-3">Recommended Actions</h4>
                <div className="space-y-2">
                  {businessIntelligence.recommendations.map((rec: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'}>
                          {rec.priority}
                        </Badge>
                        <span className="text-sm">{rec.action}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{rec.impact}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="hot-leads" className="gap-2">
            <Flame className="h-4 w-4" />
            Hot Leads ({hotLeads.length})
          </TabsTrigger>
          <TabsTrigger value="churn-risk" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Churn Risk ({atRiskCustomers.length})
          </TabsTrigger>
          <TabsTrigger value="vip" className="gap-2">
            <Crown className="h-4 w-4" />
            VIP Customers ({vipCustomers.length})
          </TabsTrigger>
        </TabsList>

        {/* Hot Leads Tab */}
        <TabsContent value="hot-leads" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {hotLeads.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Flame className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No hot leads identified yet</p>
                  <p className="text-sm">Click refresh to analyze your leads</p>
                </div>
              ) : (
                <div className="divide-y">
                  {hotLeads.slice(0, 10).map(lead => (
                    <div key={lead.id} className="p-4 flex items-center justify-between hover:bg-muted/50">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${getScoreColor(lead.conversion_score)}`}>
                          <span className="font-bold">{lead.conversion_score}</span>
                        </div>
                        <div>
                          <p className="font-medium">{lead.lead?.name}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{lead.lead?.email}</span>
                            <Badge variant="outline" className="text-xs capitalize">{lead.lead?.source}</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium">{lead.predicted_conversion_rate}% likely to convert</p>
                          {lead.recommended_followup_time && (
                            <p className="text-xs text-muted-foreground">
                              Follow up: {formatDistanceToNow(new Date(lead.recommended_followup_time))}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {lead.preferred_contact_method === 'call' && (
                            <Button size="icon" variant="ghost"><Phone className="h-4 w-4" /></Button>
                          )}
                          {lead.preferred_contact_method === 'sms' && (
                            <Button size="icon" variant="ghost"><Phone className="h-4 w-4" /></Button>
                          )}
                          <Button size="icon" variant="ghost"><Mail className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Churn Risk Tab */}
        <TabsContent value="churn-risk" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {atRiskCustomers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No customers at risk identified</p>
                  <p className="text-sm">Your customers are well-engaged!</p>
                </div>
              ) : (
                <div className="divide-y">
                  {atRiskCustomers.map(customer => (
                    <div key={customer.id} className="p-4 flex items-center justify-between hover:bg-muted/50">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          customer.churn_risk_level === 'critical' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {customer.customer?.first_name} {customer.customer?.last_name}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{customer.days_since_last_contact} days since last contact</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          {getChurnBadge(customer.churn_risk_level)}
                          <p className="text-xs text-muted-foreground mt-1">
                            {customer.next_booking_probability}% booking probability
                          </p>
                        </div>
                        <Button size="sm" variant="outline">Win Back</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* VIP Tab */}
        <TabsContent value="vip" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {vipCustomers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Crown className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No VIP customers identified yet</p>
                  <p className="text-sm">VIPs are auto-detected based on spending and loyalty</p>
                </div>
              ) : (
                <div className="divide-y">
                  {vipCustomers.map(customer => (
                    <div key={customer.id} className="p-4 flex items-center justify-between hover:bg-muted/50">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                          <Crown className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            {customer.customer?.first_name} {customer.customer?.last_name}
                            <Badge className="bg-purple-500">VIP</Badge>
                          </p>
                          <p className="text-sm text-muted-foreground">{customer.vip_reason}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-600">
                          ${customer.predicted_lifetime_value?.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">Predicted LTV</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
