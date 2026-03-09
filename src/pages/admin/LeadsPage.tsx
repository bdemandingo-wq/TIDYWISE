import { useState, useMemo, useEffect, useCallback } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Mail, Phone, UserPlus, MoreHorizontal, Trash2, Edit, Download, Filter, TrendingDown, ArrowRight, MapPin, LayoutGrid, Table2, CalendarDays, Search } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import { useTestMode } from '@/contexts/TestModeContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { LeadPipelineBoard } from '@/components/admin/LeadPipelineBoard';
import { useIsMobile } from '@/hooks/use-mobile';
import { SwipeableRow } from '@/components/mobile/SwipeableRow';
import { MobileFilterSheet } from '@/components/mobile/MobileFilterSheet';
import { cn } from '@/lib/utils';



interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  service_interest: string | null;
  message: string | null;
  notes: string | null;
  estimated_value: number | null;
  source: string;
  status: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-blue-500' },
  follow_up: { label: 'Follow Up', color: 'bg-yellow-500' },
  quoted: { label: 'Quoted', color: 'bg-purple-500' },
  commercial: { label: 'Commercial', color: 'bg-amber-500' },
  converted: { label: 'Converted', color: 'bg-green-500' },
  lost: { label: 'Lost', color: 'bg-red-500' },
};

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'google', label: 'Google' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'other', label: 'Other' },
];

export default function LeadsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [showFunnel, setShowFunnel] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'pipeline'>('pipeline');
  const [monthFilter, setMonthFilter] = useState('all');
  
  const queryClient = useQueryClient();
  const { isTestMode, maskName, maskEmail, maskPhone } = useTestMode();
  const { organization } = useOrganization();
  const isMobile = useIsMobile();


  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
    enabled: !!organization?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; phone?: string; address?: string; city?: string; state?: string; zip_code?: string; service_interest?: string; estimated_value?: number | null; message?: string; notes?: string; source: string; status: string }) => {
      if (!organization?.id) {
        throw new Error('No organization found');
      }
      const { error } = await supabase.from('leads').insert([{ ...data, organization_id: organization.id }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead created');
      setDialogOpen(false);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Lead> & { id: string }) => {
      const { error } = await supabase.from('leads').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead updated');
      setDialogOpen(false);
      setEditingLead(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('leads').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead deleted');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const convertToCustomer = async (lead: Lead) => {
    if (!organization?.id) {
      toast.error('No organization found');
      return;
    }
    
    const nameParts = lead.name.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const { error: customerError } = await supabase.from('customers').insert({
      first_name: firstName,
      last_name: lastName,
      email: lead.email,
      phone: lead.phone,
      address: lead.address,
      city: lead.city,
      state: lead.state,
      zip_code: lead.zip_code,
      organization_id: organization.id,
    });

    if (customerError) {
      toast.error('Failed to create customer');
      return;
    }

    // Try to auto-populate estimated_value from matching customer bookings
    let estimatedValue: number | null = null;

    // Look up the newly created customer (or existing match) by email in this org
    const { data: matchedCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', organization.id)
      .ilike('email', lead.email)
      .limit(1)
      .maybeSingle();

    if (matchedCustomer) {
      // Get the average or latest booking total for this customer
      const { data: bookings } = await supabase
        .from('bookings')
        .select('total_amount')
        .eq('customer_id', matchedCustomer.id)
        .eq('organization_id', organization.id)
        .in('status', ['completed', 'confirmed'])
        .order('scheduled_at', { ascending: false })
        .limit(10);

      if (bookings && bookings.length > 0) {
        // Use the average booking value as estimated value
        const total = bookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
        estimatedValue = Math.round(total / bookings.length);
      }
    }

    await supabase
      .from('leads')
      .update({ 
        status: 'converted',
        ...(estimatedValue != null ? { estimated_value: estimatedValue } : {}),
      })
      .eq('id', lead.id);

    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    toast.success(
      estimatedValue 
        ? `Lead converted to customer — estimated value: $${estimatedValue.toLocaleString()}`
        : 'Lead converted to customer'
    );
  };

  const monthOptions = useMemo(() => {
    const options = [{ value: 'all', label: 'All Months' }];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(new Date(), i);
      options.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') });
    }
    return options;
  }, []);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      const matchesSource = sourceFilter === 'all' || lead.source === sourceFilter;
      let matchesMonth = true;
      if (monthFilter !== 'all') {
        const [year, month] = monthFilter.split('-').map(Number);
        const monthStart = startOfMonth(new Date(year, month - 1));
        const monthEnd = endOfMonth(new Date(year, month - 1));
        matchesMonth = isWithinInterval(new Date(lead.created_at), { start: monthStart, end: monthEnd });
      }
      return matchesSearch && matchesStatus && matchesSource && matchesMonth;
    });
  }, [leads, searchTerm, statusFilter, sourceFilter, monthFilter]);

  const activeFilterCount = [statusFilter !== 'all', sourceFilter !== 'all', monthFilter !== 'all'].filter(Boolean).length;

  const clearAllFilters = () => {
    setStatusFilter('all');
    setSourceFilter('all');
    setMonthFilter('all');
  };

  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    follow_up: leads.filter(l => l.status === 'follow_up').length,
    quoted: leads.filter(l => l.status === 'quoted').length,
    commercial: leads.filter(l => l.status === 'commercial').length,
    converted: leads.filter(l => l.status === 'converted').length,
    lost: leads.filter(l => l.status === 'lost').length,
  };

  const funnelData = useMemo(() => {
    const stages = ['new', 'follow_up', 'quoted', 'converted'];
    const counts = stages.map(s => leads.filter(l => l.status === s).length);
    const maxCount = Math.max(...counts, 1);
    
    return stages.map((stage, i) => ({
      stage,
      label: STATUS_CONFIG[stage]?.label || stage,
      count: counts[i],
      percentage: maxCount > 0 ? Math.round((counts[i] / maxCount) * 100) : 0,
      conversionRate: i > 0 && counts[i - 1] > 0 
        ? Math.round((counts[i] / counts[i - 1]) * 100) 
        : 100,
    }));
  }, [leads]);

  const sourceBreakdown = useMemo(() => {
    const sources: Record<string, { total: number; converted: number }> = {};
    leads.forEach(lead => {
      if (!sources[lead.source]) {
        sources[lead.source] = { total: 0, converted: 0 };
      }
      sources[lead.source].total++;
      if (lead.status === 'converted') {
        sources[lead.source].converted++;
      }
    });
    return Object.entries(sources).map(([source, data]) => ({
      source,
      ...data,
      rate: data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total);
  }, [leads]);

  const exportLeadsExcel = () => {
    const headers = ['Name', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip', 'Service Interest', 'Source', 'Status', 'Notes', 'Message', 'Created'];
    const rows = filteredLeads.map(lead => [
      lead.name,
      lead.email,
      lead.phone || '',
      lead.address || '',
      lead.city || '',
      lead.state || '',
      lead.zip_code || '',
      lead.service_interest || '',
      lead.source,
      lead.status,
      lead.notes || '',
      lead.message || '',
      format(new Date(lead.created_at), 'yyyy-MM-dd'),
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Leads exported successfully');
  };

  return (
    <AdminLayout
      title="Leads"
      subtitle={`${leads.length} total leads`}
      actions={
        <div className="flex gap-2 flex-wrap">
          <div className="flex border rounded-md overflow-hidden">
            <Button
              variant={viewMode === 'pipeline' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5 rounded-none"
              onClick={() => setViewMode('pipeline')}
            >
              <LayoutGrid className="w-4 h-4" />
              Pipeline
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              className="gap-1.5 rounded-none"
              onClick={() => setViewMode('table')}
            >
              <Table2 className="w-4 h-4" />
              Table
            </Button>
          </div>
          <Button 
            variant={showFunnel ? "default" : "outline"} 
            className="gap-2" 
            onClick={() => setShowFunnel(!showFunnel)}
          >
            <TrendingDown className="w-4 h-4" />
            Funnel Report
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportLeadsExcel}>
            <Download className="w-4 h-4" />
            Export Excel
          </Button>
          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Lead
          </Button>
        </div>
      }
    >
      {/* Lead Funnel Report */}
      {showFunnel && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lead Conversion Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {funnelData.map((stage, i) => (
                  <div key={stage.stage} className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{stage.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {stage.count} leads
                        {i > 0 && (
                          <span className="ml-2 text-xs">
                            ({stage.conversionRate}% from {funnelData[i-1].label})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-8 bg-muted rounded-md overflow-hidden">
                      <div 
                        className={`h-full ${STATUS_CONFIG[stage.stage].color} transition-all duration-500`}
                        style={{ width: `${stage.percentage}%` }}
                      />
                    </div>
                    {i < funnelData.length - 1 && (
                      <div className="flex justify-center py-1">
                        <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Overall Conversion Rate</span>
                  <span className="text-lg font-bold text-green-600">
                    {stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0}%
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-muted-foreground">Lost Leads</span>
                  <span className="text-sm text-destructive">{stats.lost}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Leads by Source</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sourceBreakdown.map((item) => (
                  <div key={item.source} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <span className="font-medium capitalize">{item.source}</span>
                      <div className="text-sm text-muted-foreground">
                        {item.total} leads · {item.converted} converted
                      </div>
                    </div>
                    <Badge variant={item.rate >= 50 ? "default" : item.rate >= 25 ? "secondary" : "outline"}>
                      {item.rate}% rate
                    </Badge>
                  </div>
                ))}
                {sourceBreakdown.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No lead data yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">New</p>
            <p className="text-2xl font-bold text-blue-600">{stats.new}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Follow Up</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.follow_up}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Quoted</p>
            <p className="text-2xl font-bold text-purple-600">{stats.quoted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Commercial</p>
            <p className="text-2xl font-bold text-amber-600">{stats.commercial}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Converted</p>
            <p className="text-2xl font-bold text-green-600">{stats.converted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Lost</p>
            <p className="text-2xl font-bold text-red-600">{stats.lost}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      {isMobile ? (
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-11 rounded-xl"
            />
          </div>
          <MobileFilterSheet
            activeFilterCount={activeFilterCount}
            onClearAll={clearAllFilters}
            title="Filter Leads"
          >
            <div className="space-y-4">
              <div>
                <Label className="text-xs uppercase text-muted-foreground mb-2 block">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue placeholder="All Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {Object.entries(STATUS_CONFIG).map(([value, { label }]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase text-muted-foreground mb-2 block">Source</Label>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger><SelectValue placeholder="All Sources" /></SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase text-muted-foreground mb-2 block">Month</Label>
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger><SelectValue placeholder="All Months" /></SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </MobileFilterSheet>
        </div>
      ) : (
      <div className="flex flex-wrap gap-4 mb-4">
        <Input
          placeholder="Search leads..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([value, { label }]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[150px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[180px]">
            <CalendarDays className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            Clear Filters
          </Button>
        )}
      </div>
      )}

      {/* Mobile Card View */}
      {isMobile ? (
        <div className="space-y-2 pb-20">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-card border border-border/40 rounded-2xl p-4 animate-pulse">
                  <div className="h-4 w-1/2 bg-muted rounded" />
                  <div className="mt-2 h-3 w-2/3 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No leads found</div>
          ) : (
            filteredLeads.map((lead) => (
              <SwipeableRow
                key={lead.id}
                rightAction={{
                  label: 'Delete',
                  variant: 'destructive',
                  onAction: () => deleteMutation.mutate(lead.id),
                }}
              >
                <button
                  type="button"
                  className="w-full text-left bg-card border border-border/40 rounded-2xl p-4 active:scale-[0.99] transition-transform"
                  onClick={() => {
                    setEditingLead(lead);
                    setDialogOpen(true);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{maskName(lead.name)}</p>
                        <Badge className={cn('text-[10px] px-1.5 py-0', STATUS_CONFIG[lead.status]?.color, 'text-white')}>
                          {STATUS_CONFIG[lead.status]?.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{maskEmail(lead.email)}</p>
                      {lead.phone && (
                        <p className="text-xs text-muted-foreground mt-0.5">{maskPhone(lead.phone)}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground capitalize">{lead.source}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(lead.created_at), 'MMM d')}
                      </span>
                      {lead.estimated_value && !isTestMode && (
                        <span className="text-xs font-medium text-primary">
                          ${lead.estimated_value.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {lead.service_interest && (
                    <p className="text-xs text-muted-foreground mt-2 truncate">
                      Interest: {lead.service_interest}
                    </p>
                  )}
                </button>
              </SwipeableRow>
            ))
          )}

          {/* Mobile FAB */}
          <Button
            size="icon"
            className="fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full shadow-lg"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="w-6 h-6" />
          </Button>
        </div>
      ) : (
      <>
      {/* Pipeline View */}
      {viewMode === 'pipeline' && (
        <LeadPipelineBoard
          leads={filteredLeads}
          onStatusChange={(leadId, newStatus) => updateMutation.mutate({ id: leadId, status: newStatus })}
          onEdit={(lead) => {
            setEditingLead(lead);
            setDialogOpen(true);
          }}
          onDelete={(id) => {
            if (confirm('Delete this lead?')) deleteMutation.mutate(id);
          }}
          onConvert={convertToCustomer}
          maskName={maskName}
          maskEmail={maskEmail}
          maskPhone={maskPhone}
        />
      )}

      {/* Table View */}
      {viewMode === 'table' && (
      <Card>
        <CardContent className="p-0 overflow-x-auto" data-no-swipe>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Interest</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No leads found
                  </TableCell>
                </TableRow>
              ) : (
              filteredLeads.map((lead) => (
                  <TableRow key={lead.id} className="[&>td]:py-3 @[pointer:coarse]:min-h-[52px]">
                    <TableCell className="font-medium min-h-[44px]">{maskName(lead.name)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="w-3 h-3" /> {maskEmail(lead.email)}
                        </div>
                        {lead.phone && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Phone className="w-3 h-3" /> {maskPhone(lead.phone)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{lead.service_interest || '-'}</TableCell>
                    <TableCell className="capitalize">{lead.source}</TableCell>
                    <TableCell>
                      <Select
                        value={lead.status}
                        onValueChange={(status) => updateMutation.mutate({ id: lead.id, status })}
                      >
                        <SelectTrigger className="w-[120px] h-8">
                          <Badge className={STATUS_CONFIG[lead.status]?.color}>
                            {STATUS_CONFIG[lead.status]?.label}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_CONFIG).map(([value, { label }]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {lead.notes ? (
                        <span className="text-sm text-muted-foreground line-clamp-2" title={lead.notes}>
                          {lead.notes}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 text-sm italic">No notes</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(lead.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => {
                              setEditingLead(lead);
                              setDialogOpen(true);
                            }}
                          >
                            <Edit className="w-4 h-4" /> Edit
                          </DropdownMenuItem>
                          {lead.status !== 'converted' && (
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => convertToCustomer(lead)}
                            >
                              <UserPlus className="w-4 h-4" /> Convert to Customer
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="gap-2 text-destructive"
                            onClick={() => {
                              if (confirm('Delete this lead?')) {
                                deleteMutation.mutate(lead.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}
      </>
      )}

      {/* Add/Edit Dialog */}
      <LeadDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingLead(null);
        }}
        lead={editingLead}
        onSave={(data) => {
          if (editingLead) {
            updateMutation.mutate({ id: editingLead.id, ...data });
          } else {
            createMutation.mutate(data);
          }
        }}
      />
      
    </AdminLayout>
  );
}

function LeadDialog({
  open,
  onOpenChange,
  lead,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onSave: (data: { name: string; email: string; phone?: string; address?: string; city?: string; state?: string; zip_code?: string; service_interest?: string; estimated_value?: number | null; message?: string; notes?: string; source: string; status: string }) => void;
}) {
  // Reset form data when lead changes
  useEffect(() => {
    setFormData({
      name: lead?.name || '',
      email: lead?.email || '',
      phone: lead?.phone || '',
      address: lead?.address || '',
      city: lead?.city || '',
      state: lead?.state || '',
      zip_code: lead?.zip_code || '',
      service_interest: lead?.service_interest || '',
      estimated_value: lead?.estimated_value != null ? String(lead.estimated_value) : '',
      message: lead?.message || '',
      notes: lead?.notes || '',
      source: lead?.source || 'website',
      status: lead?.status || 'new',
    });
  }, [lead]);
  
  const [formData, setFormData] = useState({
    name: lead?.name || '',
    email: lead?.email || '',
    phone: lead?.phone || '',
    address: lead?.address || '',
    city: lead?.city || '',
    state: lead?.state || '',
    zip_code: lead?.zip_code || '',
    service_interest: lead?.service_interest || '',
    estimated_value: lead?.estimated_value != null ? String(lead.estimated_value) : '',
    message: lead?.message || '',
    notes: lead?.notes || '',
    source: lead?.source || 'website',
    status: lead?.status || 'new',
  });

  const handleSubmit = () => {
    if (!formData.name || !formData.email) return;
    const { estimated_value, ...rest } = formData;
    onSave({
      ...rest,
      estimated_value: estimated_value ? parseFloat(estimated_value) : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? 'Edit' : 'Add'} Lead</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Name *</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div>
            <Label>Email *</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Label>Address</Label>
            <Input
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="123 Main St"
            />
          </div>
          <div>
            <Label>City</Label>
            <Input
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
          </div>
          <div>
            <Label>State</Label>
            <Input
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
            />
          </div>
          <div>
            <Label>Service Interest</Label>
            <Input
              value={formData.service_interest}
              onChange={(e) => setFormData({ ...formData, service_interest: e.target.value })}
            />
          </div>
          <div>
            <Label>Estimated Value ($)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={formData.estimated_value}
              onChange={(e) => setFormData({ ...formData, estimated_value: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>Source</Label>
            <Select value={formData.source} onValueChange={(v) => setFormData({ ...formData, source: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="follow_up">Follow Up</SelectItem>
                <SelectItem value="quoted">Quoted</SelectItem>
                <SelectItem value="commercial">Commercial</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Message</Label>
            <Textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              rows={2}
              placeholder="Initial inquiry message..."
            />
          </div>
          <div className="col-span-2">
            <Label>Call Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              placeholder="How did the call go? Satisfaction, review status, recurring interest..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>{lead ? 'Update' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}